/**
 * The upload action: it posts the picked bytes to the route the listing named,
 * and turns a refusal into a message worth showing.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createUploadAction } from '../src/client/upload-action.ts'
import type { ListingReader } from '../src/client/upload-action.ts'

const SESSION = 'session-upload' as never
const LISTING = { root: '/w', path: '/w', fileRoute: '/workbench/file', uploadRoute: '/workbench/upload', entries: [] }

afterEach(() => { vi.unstubAllGlobals() })

/** A listing reader that always answers the same workspace. */
const listDir = (() => Promise.resolve(LISTING)) as unknown as ListingReader

describe('createUploadAction', () => {
  it('posts the file to the route the listing named and answers the written path', async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = []
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return Promise.resolve(new Response(JSON.stringify({ path: 'uploads/photo.jpg', bytes: 3 }), { status: 200 }))
    })
    const file = new File(['abc'], 'photo.jpg')
    const path = await createUploadAction(listDir)(SESSION, file, 'pick-1')
    expect(path).toBe('uploads/photo.jpg')
    expect(calls[0]?.url).toBe('/workbench/upload?sessionId=session-upload&name=photo.jpg&ingestId=pick-1')
    expect(calls[0]?.init?.method).toBe('POST')
    // The bytes are the body, not a base64 copy of them.
    expect(calls[0]?.init?.body).toBe(file)
  })

  it('surfaces the server’s reason for a refusal', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('body exceeds 8 bytes', { status: 413 })))
    await expect(createUploadAction(listDir)(SESSION, new File(['x'], 'x.bin'), 'pick-1'))
      .rejects.toThrow('body exceeds 8 bytes')
  })

  it('names the status when a refusal carries no reason', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('', { status: 403 })))
    await expect(createUploadAction(listDir)(SESSION, new File(['x'], 'x.bin'), 'pick-1'))
      .rejects.toThrow('HTTP 403')
  })
})
