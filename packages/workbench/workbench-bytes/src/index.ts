/**
 * The workbench byte route. The file panel's viewer reads media through one
 * `webServer` prefix route instead of a whole-file RPC, so a video seeks and a
 * large image streams without holding the file in memory. Every request is
 * fenced twice before a byte leaves the process: the browser trust fence
 * (`connection.isTrustedRequest`, the deployment's `trustedHosts` policy) and
 * the workspace fence ({@link fenceSessionPath}, the same one the panel's
 * listing uses), then the bytes are streamed from the resolved target's
 * process path.
 *
 * The same pair of prefixes receives uploads: one request body becomes one file
 * under the session's `uploads/` directory, and the ingest id a client names is
 * what makes a retry answer with the first attempt instead of storing the same
 * bytes twice.
 * @module @deepseek-ai/dsh-workbench-bytes
 */

import { createHash } from 'node:crypto'
import { closeSync, createReadStream, createWriteStream, mkdirSync, openSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import z from '@deepseek-ai/schemastery'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-session'
import { SessionId } from '@deepseek-ai/dsh-session'
import { CLIENT_DEVICES } from '@deepseek-ai/dsh-llm'
import type { ClientDevice } from '@deepseek-ai/dsh-llm'
import { contentTypeForPath, fenceSessionPath, WORKBENCH_FILE_PATH, WORKBENCH_UPLOAD_PATH, WorkbenchFenceError } from '@deepseek-ai/dsh-workbench'
import { parseRange } from './range.ts'

export const name = 'workbench-bytes'

/** Required services: the route table, the workspace fence, and the browser fence. */
export const inject = ['webServer', 'fs', 'sessions', 'connection']

/** Directory uploads land in, relative to the session workspace. */
const UPLOAD_DIR = 'uploads'

/**
 * Bucket for an upload that declared no client class. Its own name rather than
 * the root, so a file's origin is never implied by where it happens to sit.
 */
const UNKNOWN_DEVICE = 'unknown'

/** Allowed characters and length of a client-supplied opaque ingest id. */
const INGEST_ID = /^[A-Za-z0-9._-]{1,128}$/

/** Directory holding the ingest index, beside the files it describes. */
const INGEST_DIR = '.dsh'

/** File the ingest index is kept in, inside {@link INGEST_DIR}. */
const INGEST_INDEX = 'ingest.json'

/**
 * Metadata of an accepted upload. Replays use the id; the digest records the
 * accepted bytes without claiming to verify a subsequent request body.
 */
interface IngestRecord {
  /** Workspace-relative path the bytes were written to. */
  path: string
  /** Size of the written body. */
  bytes: number
  /** SHA-256 of the written body. */
  sha256: string
  /** Client class that sent it, or the unknown bucket's name. */
  device: string
  /**
   * Media type the written name resolves to. Absent on records written before
   * the type was recorded; a reader that needs it derives it from `path` rather
   * than inventing one.
   */
  mediaType?: string
  /** Epoch milliseconds the host accepted it. */
  receivedAt: number
}

/**
 * What one upload attempt answers with: the stored file, or the refusal its
 * caller must be told. An attempt resolves this instead of throwing so a
 * concurrent repeat of the same ingest can share the one outcome.
 */
type UploadOutcome =
  | { readonly kind: 'stored'; readonly path: string; readonly bytes: number }
  | { readonly kind: 'refused'; readonly status: number; readonly message: string }

/**
 * Attempts this plugin instance is running right now, keyed by session and
 * ingest id. A second request naming an id that is already being written waits
 * for that attempt instead of starting a second copy of the same bytes.
 */
type InFlightUploads = Map<string, Promise<UploadOutcome>>

/**
 * Largest body the upload route accepts when the deployment configures nothing.
 * A phone photo is a few megabytes and a screen recording is tens; past this the
 * request is refused rather than written.
 */
const DEFAULT_MAX_UPLOAD_BYTES = 64 * 1024 * 1024

/** Upload intake. Out-of-range values fail plugin load. */
export interface Config {
  /** Largest upload body in bytes. Omit for {@link DEFAULT_MAX_UPLOAD_BYTES}. */
  maxUploadBytes?: number
}

/** Schemastery validation for {@link Config}. */
export const Config: z<Config> = z.object({
  maxUploadBytes: z.number(),
})

/**
 * Reduce a client-supplied name to a plain file name, or refuse it.
 *
 * The fence already stops a path from leaving the workspace; this keeps an
 * upload from being a directory tree in the first place, so what lands is one
 * file under `uploads/` with the name the person chose.
 * @param name - the requested file name.
 * @returns the name to write, or undefined when it is not a plain file name.
 */
function plainFileName(name: string): string | undefined {
  if (name.length === 0 || name.length > 255) return undefined
  if (name.includes('/') || name.includes('\\') || name.includes('\0')) return undefined
  if (name === '.' || name === '..') return undefined
  return name
}

/** Whether an exclusive create failed because the path is already taken. */
function isAlreadyThere(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'EEXIST'
}

/**
 * Claim a path that does not overwrite an earlier upload, by creating it.
 *
 * The claim is the `wx` create, not an existence check followed by a write: two
 * uploads arriving at once would both pass the check and then stream into the
 * same file, interleaving their bytes. The claim leaves an empty file, and the
 * body is written into that path.
 * @param dir - the uploads directory.
 * @param name - the plain file name to keep.
 * @returns the absolute path this attempt owns.
 */
function reservePath(dir: string, name: string): string {
  const dot = name.lastIndexOf('.')
  const stem = dot <= 0 ? name : name.slice(0, dot)
  const suffix = dot <= 0 ? '' : name.slice(dot)
  for (let n = 1; ; n += 1) {
    const candidate = join(dir, n === 1 ? name : `${stem}-${String(n)}${suffix}`)
    try {
      closeSync(openSync(candidate, 'wx'))
      return candidate
    } catch (error) {
      if (!isAlreadyThere(error)) throw error
    }
  }
}

/**
 * End a write stream and wait for it to close.
 * @param stream - the stream to end.
 */
async function closeStream(stream: ReturnType<typeof createWriteStream>): Promise<void> {
  await new Promise<void>((resolve) => {
    stream.once('close', resolve)
    stream.destroy()
  })
}

/**
 * Stream a request body to a file, refusing a body past the limit. The digest is
 * taken as the bytes go past, so recording what was accepted never reads the
 * file back.
 * @param req - the incoming request.
 * @param path - the file to write.
 * @param maxBytes - the accepted body size.
 * @returns the bytes written and their SHA-256, or undefined when the body
 * exceeded the limit. The file is removed on both the refusal and a failure.
 */
async function writeBody(
  req: IncomingMessage,
  path: string,
  maxBytes: number,
): Promise<{ bytes: number; sha256: string } | undefined> {
  const out = createWriteStream(path)
  const digest = createHash('sha256')
  let written = 0
  try {
    for await (const chunk of req) {
      const buffer = chunk as Buffer
      written += buffer.length
      if (written > maxBytes) {
        // Wait for the stream to close before unlinking: the file may not exist
        // yet when the limit trips, and removing it first would leave the
        // write that follows to create it again.
        await closeStream(out)
        rmSync(path, { force: true })
        return undefined
      }
      digest.update(buffer)
      if (!out.write(buffer)) {
        await new Promise<void>((resolve) => { out.once('drain', resolve) })
      }
    }
    await new Promise<void>((resolve, reject) => {
      out.once('error', reject)
      out.end(resolve)
    })
    return { bytes: written, sha256: digest.digest('hex') }
  } catch (error) {
    await closeStream(out)
    rmSync(path, { force: true })
    throw error
  }
}

/**
 * Read the ingest index of one uploads directory.
 * @param dir - the uploads directory.
 * @returns the recorded ingests, or an empty index when none is readable.
 */
function readIndex(dir: string): Map<string, IngestRecord> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(dir, INGEST_DIR, INGEST_INDEX), 'utf8'))
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return new Map()
    return new Map(Object.entries(parsed).filter((entry): entry is [string, IngestRecord] =>
      INGEST_ID.test(entry[0]) && isIngestRecord(entry[1])))
  } catch {
    // An absent or unreadable index means no ingest has been recorded yet; the
    // files themselves remain the authority on what was received.
    return new Map()
  }
}

/** Validate persisted metadata before using it to answer a completed-upload retry. */
function isIngestRecord(value: unknown): value is IngestRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  if (typeof record.path !== 'string' || typeof record.device !== 'string') return false
  if (record.device !== UNKNOWN_DEVICE && !CLIENT_DEVICES.includes(record.device as ClientDevice)) return false
  const prefix = `${UPLOAD_DIR}/${record.device}/`
  if (!record.path.startsWith(prefix) || plainFileName(record.path.slice(prefix.length)) === undefined) return false
  return typeof record.bytes === 'number' && Number.isSafeInteger(record.bytes) && record.bytes >= 0
    && typeof record.sha256 === 'string' && /^[a-f0-9]{64}$/.test(record.sha256)
    && (record.mediaType === undefined
      || (typeof record.mediaType === 'string' && record.mediaType.length > 0))
    && typeof record.receivedAt === 'number' && Number.isSafeInteger(record.receivedAt) && record.receivedAt >= 0
}

/**
 * Commit one accepted record to the index.
 *
 * The read-modify-write runs under the index's writer lock and the replacement
 * is atomic, so two uploads accepted at the same moment cannot drop each
 * other's record and no reader ever sees a half-written index. The uploaded file
 * is already on disk by now, and this order is deliberate: a crash between the
 * two leaves an orphan file rather than a record naming a file that does not
 * exist.
 * @param dir - the uploads directory.
 * @param id - the ingest id the record answers.
 * @param record - the accepted metadata.
 */
async function recordIngest(dir: string, id: string, record: IngestRecord): Promise<void> {
  const indexDir = join(dir, INGEST_DIR)
  mkdirSync(indexDir, { recursive: true })
  const file = join(indexDir, INGEST_INDEX)
  await withFileLock(file, async () => {
    const index = readIndex(dir)
    index.set(id, record)
    await writeFileAtomic(file, `${JSON.stringify(Object.fromEntries(index), null, 2)}\n`, { mode: 0o600 })
  })
}

/**
 * Stream one request body into a session's uploads directory and record it.
 * @param req - the incoming request; its body is the file.
 * @param dir - the bucket directory the bytes land in.
 * @param indexDir - the uploads directory holding the ingest index.
 * @param device - the declaring client class, or the unknown bucket's name.
 * @param name - the plain file name to keep.
 * @param ingestId - the attempt the client named, or null when it named none.
 * @param maxBytes - the accepted body size.
 * @returns what this attempt stored, or the refusal its caller must be told.
 */
async function storeUpload(
  req: IncomingMessage,
  dir: string,
  indexDir: string,
  device: string,
  name: string,
  ingestId: string | null,
  maxBytes: number,
): Promise<UploadOutcome> {
  const path = reservePath(dir, name)
  const body = await writeBody(req, path, maxBytes)
  if (body === undefined) {
    return { kind: 'refused', status: 413, message: `body exceeds ${String(maxBytes)} bytes` }
  }
  const written = `${UPLOAD_DIR}/${device}/${path.slice(dir.length + 1)}`
  if (ingestId !== null) {
    await recordIngest(indexDir, ingestId, {
      path: written,
      bytes: body.bytes,
      sha256: body.sha256,
      device,
      mediaType: contentTypeForPath(written),
      receivedAt: Date.now(),
    })
  }
  return { kind: 'stored', path: written, bytes: body.bytes }
}

/**
 * Answer one attempt outcome. `repeat` reports that the bytes were already
 * received, which is what tells a client its retry did not store a second copy.
 * @param res - the response the route owns.
 * @param outcome - what the attempt stored or refused.
 * @param repeat - whether this answer replays an earlier attempt.
 */
function answerOutcome(res: ServerResponse, outcome: UploadOutcome, repeat: boolean): void {
  if (outcome.kind === 'refused') {
    refuse(res, outcome.status, outcome.message)
    return
  }
  res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(JSON.stringify({ path: outcome.path, bytes: outcome.bytes, ...repeat ? { repeat: true } : {} }))
}

/**
 * Accept one uploaded file into the session workspace's uploads directory.
 * @param ctx - context carrying the services named by {@link inject}.
 * @param req - the incoming request; its body is the file.
 * @param res - the response the route owns.
 * @param maxBytes - the accepted body size.
 * @param inFlight - attempts this plugin instance is still writing.
 */
async function receiveWorkbenchUpload(
  ctx: Context,
  req: IncomingMessage,
  res: ServerResponse,
  maxBytes: number,
  inFlight: InFlightUploads,
): Promise<void> {
  if (!ctx.connection.isTrustedRequest(req)) {
    refuse(res, 403, 'forbidden')
    return
  }
  if (req.method !== 'POST') {
    res.writeHead(405, { 'allow': 'POST' })
    res.end()
    return
  }
  /* v8 ignore next -- a request reaching a route always carries a URL. */
  const url = new URL(req.url ?? '/', 'http://localhost')
  const sessionId = url.searchParams.get('sessionId')
  const requested = url.searchParams.get('name')
  if (sessionId === null || requested === null) {
    refuse(res, 400, 'sessionId and name are required')
    return
  }
  // Which device sent this file is part of what the person handed over, so it
  // rides the path the message will name rather than a sidecar nothing reads.
  const declared = url.searchParams.get('device')
  if (declared !== null && !CLIENT_DEVICES.includes(declared as ClientDevice)) {
    refuse(res, 400, `device must be one of ${CLIENT_DEVICES.join(', ')}`)
    return
  }
  const device = declared ?? UNKNOWN_DEVICE
  // A client that can retry names its attempt, so a repeat is answered with the
  // original result instead of a second copy of the same bytes.
  const ingestId = url.searchParams.get('ingestId')
  if (ingestId !== null && !INGEST_ID.test(ingestId)) {
    refuse(res, 400, 'ingestId must be 1-128 characters of [A-Za-z0-9._-]')
    return
  }
  const name = plainFileName(requested)
  if (name === undefined) {
    refuse(res, 400, 'name must be a plain file name')
    return
  }
  let target
  try {
    ({ target } = await fenceSessionPath(ctx, SessionId(sessionId), `${UPLOAD_DIR}/${device}/${name}`))
  } catch (error) {
    if (error instanceof WorkbenchFenceError) {
      refuse(res, 403, error.message)
      return
    }
    throw error
  }
  const dir = dirname(ctx.fs.processPath(target))
  mkdirSync(dir, { recursive: true })
  // One index for the session's uploads, not one per bucket: a repeat is
  // answered from what the whole directory received, whichever bucket it names.
  const indexDir = dirname(dir)
  if (ingestId !== null) {
    const recorded = readIndex(indexDir).get(ingestId)
    if (recorded !== undefined) {
      // The repeat may carry no body at all, so the answer is sent before the
      // request stream is read: same bytes in, same result out.
      answerOutcome(res, { kind: 'stored', path: recorded.path, bytes: recorded.bytes }, true)
      return
    }
  }
  // A retry that arrives while the first attempt is still writing waits for that
  // attempt instead of starting a second copy of the same bytes. Two clients
  // naming one id are duplicates by definition, so the later one is answered
  // from the earlier one's outcome, refusal included.
  const key = ingestId === null ? undefined : `${sessionId}\n${ingestId}`
  const pending = key === undefined ? undefined : inFlight.get(key)
  if (pending !== undefined) {
    answerOutcome(res, await pending, true)
    return
  }
  const attempt = storeUpload(req, dir, indexDir, device, name, ingestId, maxBytes)
  if (key !== undefined) inFlight.set(key, attempt)
  try {
    answerOutcome(res, await attempt, false)
  } finally {
    if (key !== undefined) inFlight.delete(key)
  }
}

/** Answer one request with a plain-text status and no body. */
function refuse(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' })
  res.end(message)
}

/** Stream `[start, end]` of a file into a response, aborting with the request. */
function pipeFile(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  bounds: { start: number; end: number } | undefined,
): void {
  const stream = bounds === undefined ? createReadStream(path) : createReadStream(path, bounds)
  // The response may already carry headers, so a read failure destroys the
  // connection instead of trying to write a second status line.
  stream.on('error', () => { res.destroy() })
  req.on('close', () => { stream.destroy() })
  stream.pipe(res)
}

/**
 * Serve one byte request. Exported for the route test, which drives it through
 * the real server; production callers reach it through the registered route.
 * @param ctx - context carrying the services named by {@link inject}.
 * @param req - the incoming request.
 * @param res - the response the route owns.
 */
export async function serveWorkbenchFile(
  ctx: Context,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!ctx.connection.isTrustedRequest(req)) {
    refuse(res, 403, 'forbidden')
    return
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'allow': 'GET, HEAD' })
    res.end()
    return
  }
  const url = new URL(req.url ?? '/', 'http://localhost')
  const sessionId = url.searchParams.get('sessionId')
  const requested = url.searchParams.get('path')
  if (sessionId === null || requested === null) {
    refuse(res, 400, 'sessionId and path are required')
    return
  }
  let target
  try {
    ({ target } = await fenceSessionPath(ctx, SessionId(sessionId), requested))
  } catch (error) {
    if (error instanceof WorkbenchFenceError) {
      refuse(res, 403, error.message)
      return
    }
    throw error
  }
  const info = await ctx.fs.stat(target)
  if (info === undefined || info.type !== 'file') {
    refuse(res, 404, 'not a file')
    return
  }
  const processPath = ctx.fs.processPath(target)
  const contentType = contentTypeForPath(target.displayPath)
  const size = info.size
  if (size === undefined) {
    // Without a size there is no range arithmetic and no content length; the
    // response is a plain chunked 200.
    res.writeHead(200, { 'content-type': contentType, 'cache-control': 'no-store' })
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    pipeFile(req, res, processPath, undefined)
    return
  }
  const selection = parseRange(req.headers.range, size)
  if (selection.kind === 'unsatisfiable') {
    res.writeHead(416, {
      'content-type': contentType,
      'cache-control': 'no-store',
      'content-range': `bytes */${String(size)}`,
    })
    res.end()
    return
  }
  const bounds = selection.kind === 'partial' ? { start: selection.start, end: selection.end } : undefined
  const length = bounds === undefined ? size : bounds.end - bounds.start + 1
  res.writeHead(bounds === undefined ? 200 : 206, {
    'content-type': contentType,
    'cache-control': 'no-store',
    'accept-ranges': 'bytes',
    'content-length': String(length),
    ...bounds === undefined
      ? {}
      : { 'content-range': `bytes ${String(bounds.start)}-${String(bounds.end)}/${String(size)}` },
  })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  pipeFile(req, res, processPath, bounds)
}

/**
 * Register the workbench's two byte routes: reading a workspace file, and
 * receiving an uploaded one.
 * @param ctx - Cordis context carrying the webserver, fs, sessions, and connection services.
 * @param config - the deployment's upload limit.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const maxBytes = config.maxUploadBytes ?? DEFAULT_MAX_UPLOAD_BYTES
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error(`workbench-bytes: maxUploadBytes must be a positive integer, got ${String(config.maxUploadBytes)}`)
  }
  // One intake per plugin instance: an in-flight attempt is this instance's own
  // state, so it lives no longer than the registration that can answer with it.
  const inFlight: InFlightUploads = new Map()
  ctx.effect(
    () => ctx.webServer.register({
      kind: 'prefix',
      path: WORKBENCH_FILE_PATH,
      handler: (req, res) => serveWorkbenchFile(ctx, req, res),
    }),
    'workbench-bytes: file route',
  )
  ctx.effect(
    () => ctx.webServer.register({
      kind: 'prefix',
      path: WORKBENCH_UPLOAD_PATH,
      handler: (req, res) => receiveWorkbenchUpload(ctx, req, res, maxBytes, inFlight),
    }),
    'workbench-bytes: upload route',
  )
}
