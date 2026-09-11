/**
 * The upload action on a page that can say which device it is: the class rides
 * the request, because that is what files the upload under its sender.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-runtime/client', () => ({
  resolvedClientDevice: () => 'mobile-app',
}))

const { createUploadAction } = await import('../src/client/upload-action.ts')

const SESSION = 'session-upload' as never
const LISTING = {
  root: '/w',
  path: '/w',
  fileRoute: '/workbench/file',
  uploadRoute: '/workbench/upload',
  entries: [],
}

describe('createUploadAction with a declared device', () => {
  it('names this page’s class on the request', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', (url: string) => {
      calls.push(url)
      return Promise.resolve(new Response(JSON.stringify({ path: 'uploads/mobile-app/x.jpg' }), { status: 200 }))
    })
    const listDir = (() => Promise.resolve(LISTING)) as never
    await createUploadAction(listDir)(SESSION, new File(['x'], 'x.jpg'), 'pick-1')
    expect(calls[0]).toBe('/workbench/upload?sessionId=session-upload&name=x.jpg&ingestId=pick-1&device=mobile-app')
    vi.unstubAllGlobals()
  })
})
