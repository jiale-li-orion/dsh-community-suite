/**
 * Response encoding: which requests get a compressed body, what the covered
 * responses announce, and that a compressed body still decodes to the original.
 */

import { gunzipSync } from 'node:zlib'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'
import { COMPRESSION_MIN_BYTES, selectEncoding, sendEncoded } from '../src/encode.ts'

const JS = 'text/javascript; charset=utf-8'

/** Minimal response double recording what a handler wrote. */
function response(): { res: ServerResponse; status: () => number; headers: () => Record<string, string>; body: () => Buffer } {
  let status = 0
  let headers: Record<string, string> = {}
  let body = Buffer.alloc(0)
  const res = {
    writeHead(nextStatus: number, nextHeaders?: Record<string, string>) {
      status = nextStatus
      headers = nextHeaders ?? {}
      return res
    },
    end(chunk?: Uint8Array) {
      body = chunk === undefined ? Buffer.alloc(0) : Buffer.from(chunk)
      return res
    },
  } as unknown as ServerResponse
  return { res, status: () => status, headers: () => headers, body: () => body }
}

/** Minimal request double carrying only the header under test. */
function request(acceptEncoding?: string): IncomingMessage {
  return { headers: acceptEncoding === undefined ? {} : { 'accept-encoding': acceptEncoding } } as IncomingMessage
}

function select(acceptEncoding: string | undefined, contentType = JS, size = 4096) {
  return selectEncoding(acceptEncoding, contentType, size)
}

describe('selectEncoding', () => {
  it('compresses a compressible body when the request accepts gzip', () => {
    expect(select('gzip')).toBe('gzip')
    expect(select('gzip, deflate, br')).toBe('gzip')
    expect(select('*')).toBe('gzip')
  })

  it('leaves the body unchanged without an acceptable encoding', () => {
    expect(select(undefined)).toBeUndefined()
    expect(select('')).toBeUndefined()
    expect(select('identity')).toBeUndefined()
    expect(select('br, deflate')).toBeUndefined()
  })

  it('honours an explicit refusal', () => {
    expect(select('gzip;q=0')).toBeUndefined()
    expect(select('*;q=0')).toBeUndefined()
    expect(select('br;q=1, gzip;q=0.5')).toBe('gzip')
  })

  it('leaves bodies below the framing threshold and non-text bodies alone', () => {
    expect(select('gzip', JS, COMPRESSION_MIN_BYTES - 1)).toBeUndefined()
    expect(select('gzip', 'application/octet-stream')).toBeUndefined()
    expect(select('gzip', 'image/png')).toBeUndefined()
  })
})

describe('sendEncoded', () => {
  it('gzip-encodes the body and announces the encoding and the variance', async () => {
    const source = 'x'.repeat(8192)
    const { res, status, headers, body } = response()
    await sendEncoded(request('gzip'), res, 200, Buffer.from(source), { 'content-type': JS })
    expect(status()).toBe(200)
    expect(headers()['content-encoding']).toBe('gzip')
    expect(headers()['vary']).toBe('accept-encoding')
    expect(headers()['content-length']).toBeUndefined()
    expect(gunzipSync(body()).toString('utf8')).toBe(source)
  })

  it('sends a non-text body unchanged without claiming variance', async () => {
    const source = Buffer.alloc(4096, 7)
    const { res, headers, body } = response()
    await sendEncoded(request('gzip'), res, 200, source, { 'content-type': 'application/octet-stream' })
    expect(headers()['content-encoding']).toBeUndefined()
    expect(headers()['vary']).toBeUndefined()
    expect(body().equals(source)).toBe(true)
  })

  it('sends text unchanged but still varies when the request refused compression', async () => {
    const { res, headers, body } = response()
    await sendEncoded(request('gzip;q=0'), res, 200, 'y'.repeat(4096), { 'content-type': JS })
    expect(headers()['content-encoding']).toBeUndefined()
    expect(headers()['vary']).toBe('accept-encoding')
    expect(body().toString('utf8')).toBe('y'.repeat(4096))
  })
})
