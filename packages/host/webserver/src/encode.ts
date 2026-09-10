/**
 * Response body encoding for the routes that ship large text bodies: the SPA
 * dist and the client plugin bundles. A phone reaching this server through a
 * relay pays for every uncompressed byte, and the client bundles alone are
 * several megabytes, so those routes negotiate the best encoding the request
 * accepts instead of always sending identity.
 *
 * gzip is the only encoding offered: brotli would save roughly another tenth of
 * the bytes but costs several times the CPU on every request, and these routes
 * have no cached-compressed-body layer yet. Sending identity is always a valid
 * outcome — a request that accepts nothing, a body below the framing threshold,
 * and a non-text body all ship unchanged.
 *
 * Every covered response carries `vary: accept-encoding`, including the
 * unchanged ones, so a shared cache never hands a compressed body to a client
 * that did not ask for one.
 * @module @deepseek-ai/dsh-host-webserver/encode
 */

import { gzip } from 'node:zlib'
import { promisify } from 'node:util'
import type { IncomingMessage, ServerResponse } from 'node:http'

const gzipAsync = promisify(gzip)

/** Bodies below this size ship unchanged: gzip framing would cost more than it saves. */
export const COMPRESSION_MIN_BYTES = 1024

/** Content types this server compresses (the bodies its covered routes serve). */
const COMPRESSIBLE_TYPE = /^(?:text\/|image\/svg\+xml|application\/(?:javascript|json|xml|manifest\+json))/

/** One encoding this server can produce. */
export type ResponseEncoding = 'gzip'

/**
 * Whether an Accept-Encoding header admits one coding, honouring `q=0`.
 * @param header - the request's Accept-Encoding value.
 * @param coding - the coding to test.
 * @returns true when the coding (or a `*` wildcard) is acceptable.
 */
function accepts(header: string, coding: string): boolean {
  for (const candidate of [coding, '*']) {
    const match = new RegExp(`(?:^|,)\\s*${candidate === '*' ? '\\*' : candidate}\\s*(?:;\\s*q\\s*=\\s*([0-9.]+))?`)
      .exec(header)
    if (match === null) continue
    if (match[1] === undefined || Number.parseFloat(match[1]) > 0) return true
  }
  return false
}

/**
 * Choose the response encoding for one body.
 * @param acceptEncoding - the request's Accept-Encoding header.
 * @param contentType - the response's Content-Type, with or without parameters.
 * @param size - body length in bytes.
 * @returns the encoding to apply, or undefined to send the body unchanged.
 */
export function selectEncoding(
  acceptEncoding: string | undefined,
  contentType: string,
  size: number,
): ResponseEncoding | undefined {
  if (size < COMPRESSION_MIN_BYTES) return undefined
  if (!COMPRESSIBLE_TYPE.test(contentType)) return undefined
  if (acceptEncoding === undefined) return undefined
  return accepts(acceptEncoding.toLowerCase(), 'gzip') ? 'gzip' : undefined
}

/**
 * Write one response, compressed when the request accepts it and the body is
 * worth compressing.
 * @param req - the request whose Accept-Encoding is honoured.
 * @param res - the response to write.
 * @param status - HTTP status code.
 * @param body - the body; a string is sent as UTF-8.
 * @param headers - response headers; `content-type` decides compressibility.
 */
export async function sendEncoded(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  body: Buffer | string,
  headers: Record<string, string>,
): Promise<void> {
  const buffer = typeof body === 'string' ? Buffer.from(body, 'utf8') : body
  const contentType = headers['content-type'] ?? ''
  const encoding = selectEncoding(req.headers['accept-encoding'], contentType, buffer.length)
  const outgoing = { ...headers }
  // A covered response varies on Accept-Encoding whether or not this particular
  // request was compressed.
  if (COMPRESSIBLE_TYPE.test(contentType)) outgoing.vary = 'accept-encoding'
  if (encoding === undefined) {
    res.writeHead(status, outgoing)
    res.end(buffer)
    return
  }
  delete outgoing['content-length']
  const compressed = await gzipAsync(buffer)
  outgoing['content-encoding'] = encoding
  res.writeHead(status, outgoing)
  res.end(compressed)
}
