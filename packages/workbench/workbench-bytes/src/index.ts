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

import { createReadStream } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-session'
import { SessionId } from '@deepseek-ai/dsh-session'
import { contentTypeForPath, fenceSessionPath, WORKBENCH_FILE_PATH, WorkbenchFenceError } from '@deepseek-ai/dsh-workbench'
import { parseRange } from './range.ts'

export const name = 'workbench-bytes'

/** Required services: the route table, the workspace fence, and the browser fence. */
export const inject = ['webServer', 'fs', 'sessions', 'connection']

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
 * Register the byte route.
 * @param ctx - Cordis context carrying the webserver, fs, sessions, and connection services.
 */
export function apply(ctx: Context): void {
  ctx.effect(
    () => ctx.webServer.register({
      kind: 'prefix',
      path: WORKBENCH_FILE_PATH,
      handler: (req, res) => serveWorkbenchFile(ctx, req, res),
    }),
    'workbench-bytes: file route',
  )
}
