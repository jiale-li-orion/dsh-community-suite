/**
 * The workbench byte route over a real HTTP server: the two fences (browser
 * trust and workspace containment), the status matrix (200/206/405/416/403/404),
 * HEAD, and streaming from the resolved target's process path.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ServerResponse } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { LocalFileSystem } from '@deepseek-ai/dsh-fs-local'
import { SessionId } from '@deepseek-ai/dsh-session'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import { WORKBENCH_FILE_PATH } from '@deepseek-ai/dsh-workbench'
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
 * Boot the route over a real HTTP server and a real temp workspace.
 * @param trusted - what the connection trust fence answers.
 * @returns the base URL and the temp workspace root.
 */
async function bench(trusted = true): Promise<{ base: string; root: string }> {
  root = await mkdtemp(join(tmpdir(), 'dsh-workbench-bytes-'))
  await mkdir(join(root, 'media'))
  await writeFile(join(root, 'media', 'note.txt'), BODY)
  await writeFile(join(root, 'media', 'image.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
  await ctx.plugin(LocalFileSystem, { cwd: root })
  ctx.provide('sessions', {
    get: (id: SessionId) => (id === SESSION ? { header: { cwd: root } } : undefined),
  } as never)
  ctx.provide('connection', { isTrustedRequest: () => trusted } as never)
  await ctx.plugin({ name: 'workbench-bytes', inject: ['webServer', 'fs', 'sessions', 'connection'], apply: applyBytes })
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
      await ctx.plugin({ name: 'workbench-bytes', inject: ['webServer', 'fs', 'sessions', 'connection'], apply: applyBytes })
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
    await ctx.plugin({ name: 'workbench-bytes', inject: ['webServer', 'fs', 'sessions', 'connection'], apply: applyBytes })
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
