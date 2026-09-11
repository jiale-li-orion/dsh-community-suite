/**
 * The workbench byte route over a real HTTP server: the two fences (browser
 * trust and workspace containment), the status matrix (200/206/405/416/403/404),
 * HEAD, and streaming from the resolved target's process path.
 */
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ServerResponse } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { LocalFileSystem } from '@deepseek-ai/dsh-fs-local'
import { SessionId } from '@deepseek-ai/dsh-session'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import { WORKBENCH_FILE_PATH, WORKBENCH_UPLOAD_PATH } from '@deepseek-ai/dsh-workbench'
import { apply as applyBytes, serveWorkbenchFile } from '../src/index.ts'
import * as BytesInvariant from '../src/invariant.ts'

const SESSION = SessionId('session-bytes-test')
const BODY = 'hello workbench bytes\n'

let root: string | undefined
const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/**
 * Boot the routes over a real HTTP server and a real temp workspace.
 * @param trusted - what the connection trust fence answers.
 * @param maxUploadBytes - the upload body limit the route enforces.
 * @returns the base URL and the temp workspace root.
 */
async function bench(
  trusted = true,
  maxUploadBytes = 1024 * 1024,
  sessionsThrow = false,
): Promise<{ base: string; root: string }> {
  root = await mkdtemp(join(tmpdir(), 'dsh-workbench-bytes-'))
  await mkdir(join(root, 'media'))
  await writeFile(join(root, 'media', 'note.txt'), BODY)
  await writeFile(join(root, 'media', 'image.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
  await ctx.plugin(LocalFileSystem, { cwd: root })
  ctx.provide('sessions', {
    get: (id: SessionId) => {
      // A backend failure is not a fence refusal: it must not be reported as
      // one, or a client would believe its path was rejected.
      if (sessionsThrow) throw new Error('session store unavailable')
      return id === SESSION ? { header: { cwd: root } } : undefined
    },
  } as never)
  ctx.provide('connection', { isTrustedRequest: () => trusted } as never)
  await ctx.plugin({
    name: 'workbench-bytes',
    inject: ['webServer', 'fs', 'sessions', 'connection'],
    apply: (inner: Context) => { applyBytes(inner, { maxUploadBytes }) },
  })
  return { base: `http://127.0.0.1:${String(ctx.webServer.port)}`, root }
}

/** Build one route URL. */
function fileUrl(base: string, root: string, name: string): string {
  const params = new URLSearchParams({ sessionId: SESSION, path: join(root, 'media', name) })
  return `${base}${WORKBENCH_FILE_PATH}?${params.toString()}`
}

describe('workbench byte route', () => {
  it('serves a whole file with its type, length, and range support', async () => {
    const { base, root: workspace } = await bench()
    const response = await fetch(fileUrl(base, workspace, 'note.txt'))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(response.headers.get('content-length')).toBe(String(BODY.length))
    expect(response.headers.get('accept-ranges')).toBe('bytes')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.text()).toBe(BODY)
  })

  it('answers HEAD with the same headers and no body', async () => {
    const { base, root: workspace } = await bench()
    const response = await fetch(fileUrl(base, workspace, 'note.txt'), { method: 'HEAD' })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-length')).toBe(String(BODY.length))
    expect(await response.text()).toBe('')
  })

  it('serves a closed range as 206 with a content-range', async () => {
    const { base, root: workspace } = await bench()
    const response = await fetch(fileUrl(base, workspace, 'note.txt'), { headers: { range: 'bytes=0-4' } })
    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe(`bytes 0-4/${String(BODY.length)}`)
    expect(response.headers.get('content-length')).toBe('5')
    expect(await response.text()).toBe(BODY.slice(0, 5))
  })

  it('serves a suffix range from the end of the file', async () => {
    const { base, root: workspace } = await bench()
    const response = await fetch(fileUrl(base, workspace, 'note.txt'), { headers: { range: 'bytes=-5' } })
    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe(`bytes ${String(BODY.length - 5)}-${String(BODY.length - 1)}/${String(BODY.length)}`)
    expect(await response.text()).toBe(BODY.slice(-5))
  })

  it('rejects an unsatisfiable range with 416 and the representation size', async () => {
    const { base, root: workspace } = await bench()
    const response = await fetch(fileUrl(base, workspace, 'note.txt'), { headers: { range: 'bytes=9999-' } })
    expect(response.status).toBe(416)
    expect(response.headers.get('content-range')).toBe(`bytes */${String(BODY.length)}`)
  })

  it('ignores a malformed range header and serves the whole file', async () => {
    const { base, root: workspace } = await bench()
    const response = await fetch(fileUrl(base, workspace, 'note.txt'), { headers: { range: 'bytes=0-1,4-5' } })
    expect(response.status).toBe(200)
    expect(await response.text()).toBe(BODY)
  })

  it('types an image by extension', async () => {
    const { base, root: workspace } = await bench()
    const response = await fetch(fileUrl(base, workspace, 'image.png'))
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))
  })

  it('refuses a request the browser trust fence rejects', async () => {
    const { base, root: workspace } = await bench(false)
    const response = await fetch(fileUrl(base, workspace, 'note.txt'))
    expect(response.status).toBe(403)
    expect(await response.text()).toBe('forbidden')
  })

  it('refuses a path outside the session workspace', async () => {
    const { base } = await bench()
    const outside = await mkdtemp(join(tmpdir(), 'dsh-workbench-bytes-outside-'))
    try {
      const params = new URLSearchParams({ sessionId: SESSION, path: join(outside, 'note.txt') })
      const response = await fetch(`${base}${WORKBENCH_FILE_PATH}?${params.toString()}`)
      expect(response.status).toBe(403)
      expect(await response.text()).toMatch(/outside the session workspace/)
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('answers 404 for a directory and for an absent file', async () => {
    const { base, root: workspace } = await bench()
    const directory = await fetch(fileUrl(base, workspace, ''))
    expect(directory.status).toBe(404)
    const absent = await fetch(fileUrl(base, workspace, 'missing.txt'))
    expect(absent.status).toBe(404)
  })

  it('answers 400 without both query parameters and 405 for a write method', async () => {
    const { base, root: workspace } = await bench()
    const missing = await fetch(`${base}${WORKBENCH_FILE_PATH}`)
    expect(missing.status).toBe(400)
    const post = await fetch(fileUrl(base, workspace, 'note.txt'), { method: 'POST' })
    expect(post.status).toBe(405)
    expect(post.headers.get('allow')).toBe('GET, HEAD')
  })

  it('streams a size-less target as a chunked 200', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    const workspace = await mkdtemp(join(tmpdir(), 'dsh-workbench-bytes-nosize-'))
    try {
      await writeFile(join(workspace, 'blob.bin'), 'blob')
      await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
      const target = { displayPath: join(workspace, 'blob.bin'), targetKey: join(workspace, 'blob.bin') }
      ctx.provide('fs', {
        resolve: () => Promise.resolve(target),
        contains: () => true,
        stat: () => Promise.resolve({ type: 'file', version: 'v' }),
        processPath: () => target.displayPath,
      } as never)
      ctx.provide('sessions', { get: () => ({ header: { cwd: workspace } }) } as never)
      ctx.provide('connection', { isTrustedRequest: () => true } as never)
      await ctx.plugin({
        name: 'workbench-bytes',
        inject: ['webServer', 'fs', 'sessions', 'connection'],
        apply: (inner: Context) => { applyBytes(inner) },
      })
      const params = new URLSearchParams({ sessionId: SESSION, path: target.displayPath })
      const url = `http://127.0.0.1:${String(ctx.webServer.port)}${WORKBENCH_FILE_PATH}?${params.toString()}`
      const response = await fetch(url)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-length')).toBeNull()
      expect(await response.text()).toBe('blob')
      const head = await fetch(url, { method: 'HEAD' })
      expect(head.status).toBe(200)
      expect(await head.text()).toBe('')
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })

  it('destroys the response when the stream fails after the headers', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    const target = { displayPath: '/w/gone.bin', targetKey: '/w/gone.bin' }
    await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
    ctx.provide('fs', {
      resolve: () => Promise.resolve(target),
      contains: () => true,
      stat: () => Promise.resolve({ type: 'file', version: 'v', size: 4 }),
      // A path that cannot be opened: the stream errors after writeHead.
      processPath: () => join(tmpdir(), 'dsh-workbench-bytes-does-not-exist', 'gone.bin'),
    } as never)
    ctx.provide('sessions', { get: () => ({ header: { cwd: '/w' } }) } as never)
    ctx.provide('connection', { isTrustedRequest: () => true } as never)
    await ctx.plugin({
      name: 'workbench-bytes',
      inject: ['webServer', 'fs', 'sessions', 'connection'],
      apply: (inner: Context) => { applyBytes(inner) },
    })
    const params = new URLSearchParams({ sessionId: SESSION, path: target.displayPath })
    await expect(
      fetch(`http://127.0.0.1:${String(ctx.webServer.port)}${WORKBENCH_FILE_PATH}?${params.toString()}`),
    ).rejects.toThrow()
  })
})

describe('serveWorkbenchFile without a request URL', () => {
  /** Capture the status and body a handler writes. */
  function recorder(): { res: ServerResponse; status: () => number; body: () => string } {
    let status = 0
    let body = ''
    return {
      res: {
        writeHead: (code: number) => { status = code },
        end: (chunk?: string) => { body = chunk ?? '' },
        destroy: () => {},
      } as unknown as ServerResponse,
      status: () => status,
      body: () => body,
    }
  }

  it('answers 400 when the request carries no URL at all', async () => {
    const { res, status } = recorder()
    const ctx = {
      connection: { isTrustedRequest: () => true },
      sessions: { get: () => undefined },
    } as never
    await serveWorkbenchFile(ctx, { method: 'GET', headers: {} } as never, res)
    expect(status()).toBe(400)
  })

  it('rethrows a fence failure that is not a workspace refusal', async () => {
    const { res } = recorder()
    const ctx = {
      connection: { isTrustedRequest: () => true },
      sessions: { get: () => ({ header: { cwd: '/w' } }) },
      fs: { resolve: () => Promise.reject(new Error('backend exploded')) },
    } as never
    await expect(serveWorkbenchFile(
      ctx,
      { method: 'GET', headers: {}, url: `${WORKBENCH_FILE_PATH}?sessionId=${SESSION}&path=%2Fw%2Fa.txt` } as never,
      res,
    )).rejects.toThrow('backend exploded')
  })
})

describe('workbench-bytes invariant companion', () => {
  it('declares its companion identity and explained empty invariant', () => {
    expect(BytesInvariant.name).toBe('workbench-bytes-invariant')
    expect(BytesInvariant.inject).toEqual(['invariants'])
  })
})

/** Build one upload URL for a named file. */
function uploadUrl(base: string, name: string, sessionId = SESSION): string {
  const params = new URLSearchParams({ sessionId, name })
  return `${base}${WORKBENCH_UPLOAD_PATH}?${params.toString()}`
}

describe('workbench upload route', () => {
  it('writes the body into the workspace uploads directory and names the path', async () => {
    const { base, root } = await bench()
    const response = await fetch(uploadUrl(base, 'note from phone.txt'), {
      method: 'POST',
      body: 'picked on the phone\n',
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ path: 'uploads/note from phone.txt', bytes: 20 })
    // The bytes are where the agent's own tools will look for them.
    expect(await readFile(join(root, 'uploads', 'note from phone.txt'), 'utf8'))
      .toBe('picked on the phone\n')
  })

  it('keeps an earlier upload instead of overwriting it', async () => {
    const { base, root } = await bench()
    const first = await fetch(uploadUrl(base, 'shot.png'), { method: 'POST', body: 'one' })
    const second = await fetch(uploadUrl(base, 'shot.png'), { method: 'POST', body: 'two' })
    expect((await first.json() as { path: string }).path).toBe('uploads/shot.png')
    expect((await second.json() as { path: string }).path).toBe('uploads/shot-2.png')
    expect(await readFile(join(root, 'uploads', 'shot.png'), 'utf8')).toBe('one')
  })

  it('refuses an untrusted caller before reading the body', async () => {
    const { base } = await bench(false)
    const response = await fetch(uploadUrl(base, 'note.txt'), { method: 'POST', body: 'x' })
    expect(response.status).toBe(403)
  })

  it('accepts only POST and only with both parameters', async () => {
    const { base } = await bench()
    expect((await fetch(uploadUrl(base, 'note.txt'))).status).toBe(405)
    expect((await fetch(`${base}${WORKBENCH_UPLOAD_PATH}?name=a.txt`, { method: 'POST' })).status).toBe(400)
    expect((await fetch(`${base}${WORKBENCH_UPLOAD_PATH}?sessionId=${SESSION}`, { method: 'POST' })).status).toBe(400)
  })

  it('refuses a name that is a path rather than a file name', async () => {
    const { base } = await bench()
    for (const name of ['../escape.txt', 'dir/nested.txt', '..', '']) {
      const response = await fetch(uploadUrl(base, name), { method: 'POST', body: 'x' })
      expect(response.status).toBe(400)
    }
  })

  it('refuses a body past the limit and leaves nothing behind', async () => {
    const { base, root } = await bench(true, 8)
    const response = await fetch(uploadUrl(base, 'big.bin'), { method: 'POST', body: 'way past the limit' })
    expect(response.status).toBe(413)
    expect(existsSync(join(root, 'uploads', 'big.bin'))).toBe(false)
  })
})

describe('workbench upload route — refusals and edge cases', () => {
  it('refuses a session the workspace fence cannot resolve', async () => {
    const { base } = await bench()
    const response = await fetch(uploadUrl(base, 'note.txt', SessionId('session-elsewhere')), {
      method: 'POST',
      body: 'x',
    })
    expect(response.status).toBe(403)
  })

  it('refuses a name that is too long or carries a separator the fence would treat as a path', async () => {
    const { base } = await bench()
    for (const name of ['a'.repeat(256), 'dir\\nested.txt', '.']) {
      const response = await fetch(uploadUrl(base, name), { method: 'POST', body: 'x' })
      expect(response.status).toBe(400)
    }
  })

  it('keeps numbering while every candidate is taken', async () => {
    const { base } = await bench()
    await fetch(uploadUrl(base, 'shot.png'), { method: 'POST', body: 'one' })
    await fetch(uploadUrl(base, 'shot.png'), { method: 'POST', body: 'two' })
    const third = await fetch(uploadUrl(base, 'shot.png'), { method: 'POST', body: 'three' })
    expect((await third.json() as { path: string }).path).toBe('uploads/shot-3.png')
  })

  it('numbers a collision even when the name carries no extension', async () => {
    const { base } = await bench()
    await fetch(uploadUrl(base, 'LICENSE'), { method: 'POST', body: 'one' })
    const second = await fetch(uploadUrl(base, 'LICENSE'), { method: 'POST', body: 'two' })
    expect((await second.json() as { path: string }).path).toBe('uploads/LICENSE-2')
  })

  it('writes a body large enough to need backpressure', async () => {
    const { base, root } = await bench(true, 8 * 1024 * 1024)
    const body = new Uint8Array(1024 * 1024).fill(7)
    const response = await fetch(uploadUrl(base, 'frame.bin'), { method: 'POST', body })
    expect(response.status).toBe(200)
    expect((await response.json() as { bytes: number }).bytes).toBe(body.length)
    expect(existsSync(join(root, 'uploads', 'frame.bin'))).toBe(true)
  })

  it('leaves no partial file when the request dies mid-body', async () => {
    const { base, root } = await bench(true, 8 * 1024 * 1024)
    const controller = new AbortController()
    const pending = fetch(uploadUrl(base, 'interrupted.bin'), {
      method: 'POST',
      body: new ReadableStream<Uint8Array>({
        start(stream) {
          stream.enqueue(new Uint8Array(64 * 1024))
          // Abort while the route is still reading, so the write never ends.
          setTimeout(() => { controller.abort() }, 20)
        },
      }),
      signal: controller.signal,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' })
    await expect(pending).rejects.toThrow()
    await new Promise((resolve) => { setTimeout(resolve, 50) })
    expect(existsSync(join(root, 'uploads', 'interrupted.bin'))).toBe(false)
  })

  it('fails plugin load on an upload limit that cannot bound a body', async () => {
    const ctx = new Context()
    expect(() => { applyBytes(ctx, { maxUploadBytes: 0 }) }).toThrow(/maxUploadBytes/)
    expect(() => { applyBytes(ctx, { maxUploadBytes: 1.5 }) }).toThrow(/maxUploadBytes/)
  })
})

describe('workbench upload route — backend failure', () => {
  it('propagates a failure that is not a fence refusal', async () => {
    const { base } = await bench(true, 1024 * 1024, true)
    const response = await fetch(uploadUrl(base, 'note.txt'), { method: 'POST', body: 'x' })
    // Not 403: a store failure is the server's to report, and the route only has
    // to avoid passing it off as a refused path.
    expect(response.status).toBe(400)
  })
})
