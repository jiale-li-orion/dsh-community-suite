/**
 * The workbench byte route. The file panel's viewer reads media through one
 * `webServer` prefix route instead of a whole-file RPC, so a video seeks and a
 * large image streams without holding the file in memory. Every request is
 * fenced twice before a byte leaves the process: the browser trust fence
 * (`connection.isTrustedRequest`, the deployment's `trustedHosts` policy) and
 * the workspace fence ({@link fenceSessionPath}, the same one the panel's
 * listing uses), then the bytes are streamed from the resolved target's
 * process path.
 * @module @deepseek-ai/dsh-workbench-bytes
 */

import { createReadStream, createWriteStream, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import z from '@deepseek-ai/schemastery'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-session'
import { SessionId } from '@deepseek-ai/dsh-session'
import { contentTypeForPath, fenceSessionPath, WORKBENCH_FILE_PATH, WORKBENCH_UPLOAD_PATH, WorkbenchFenceError } from '@deepseek-ai/dsh-workbench'
import { parseRange } from './range.ts'

export const name = 'workbench-bytes'

/** Required services: the route table, the workspace fence, and the browser fence. */
export const inject = ['webServer', 'fs', 'sessions', 'connection']

/** Directory uploads land in, relative to the session workspace. */
const UPLOAD_DIR = 'uploads'

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

/**
 * Pick a path that does not overwrite an earlier upload.
 * @param dir - the uploads directory.
 * @param name - the plain file name to keep.
 * @returns the absolute path to write.
 */
function freePath(dir: string, name: string): string {
  const first = join(dir, name)
  if (!existsSync(first)) return first
  const dot = name.lastIndexOf('.')
  const stem = dot <= 0 ? name : name.slice(0, dot)
  const suffix = dot <= 0 ? '' : name.slice(dot)
  for (let n = 2; ; n += 1) {
    const candidate = join(dir, `${stem}-${String(n)}${suffix}`)
    if (!existsSync(candidate)) return candidate
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
 * Stream a request body to a file, refusing a body past the limit.
 * @param req - the incoming request.
 * @param path - the file to write.
 * @param maxBytes - the accepted body size.
 * @returns the bytes written, or undefined when the body exceeded the limit.
 */
async function writeBody(
  req: IncomingMessage,
  path: string,
  maxBytes: number,
): Promise<number | undefined> {
  const out = createWriteStream(path)
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
      if (!out.write(buffer)) {
        await new Promise<void>((resolve) => { out.once('drain', resolve) })
      }
    }
    await new Promise<void>((resolve, reject) => {
      out.once('error', reject)
      out.end(resolve)
    })
    return written
  } catch (error) {
    await closeStream(out)
    rmSync(path, { force: true })
    throw error
  }
}

/**
 * Accept one uploaded file into the session workspace's uploads directory.
 * Exported for the route test, which drives it through the real server.
 * @param ctx - context carrying the services named by {@link inject}.
 * @param req - the incoming request; its body is the file.
 * @param res - the response the route owns.
 * @param maxBytes - the accepted body size.
 */
export async function receiveWorkbenchUpload(
  ctx: Context,
  req: IncomingMessage,
  res: ServerResponse,
  maxBytes: number,
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
  const name = plainFileName(requested)
  if (name === undefined) {
    refuse(res, 400, 'name must be a plain file name')
    return
  }
  let target
  try {
    ({ target } = await fenceSessionPath(ctx, SessionId(sessionId), `${UPLOAD_DIR}/${name}`))
  } catch (error) {
    if (error instanceof WorkbenchFenceError) {
      refuse(res, 403, error.message)
      return
    }
    throw error
  }
  const dir = dirname(ctx.fs.processPath(target))
  mkdirSync(dir, { recursive: true })
  const path = freePath(dir, name)
  const bytes = await writeBody(req, path, maxBytes)
  if (bytes === undefined) {
    refuse(res, 413, `body exceeds ${String(maxBytes)} bytes`)
    return
  }
  res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(JSON.stringify({ path: `${UPLOAD_DIR}/${path.slice(dir.length + 1)}`, bytes }))
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
      handler: (req, res) => receiveWorkbenchUpload(ctx, req, res, maxBytes),
    }),
    'workbench-bytes: upload route',
  )
}
