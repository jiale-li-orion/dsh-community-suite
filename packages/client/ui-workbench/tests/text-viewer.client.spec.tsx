// @vitest-environment jsdom
/**
 * Text viewer presentation: what the selector elects, and the three states a
 * fetch can produce — loading, text, and a failure notice.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { TextViewer, TEXT_PREVIEW_LIMIT, textTypeSelector } from '../src/client/TextViewer.tsx'
import type { TextViewerProps } from '../src/client/TextViewer.tsx'
import type { WorkbenchViewerOwnerProps } from '../src/client/contract/slots.ts'
import { zh } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const t = makeTranslate(zh)

/** Build the viewer's composed props. */
function props(url = '/workbench/file?path=/w/a.ts'): TextViewerProps {
  return { name: 'a.ts', path: '/w/a.ts', url, mediaType: 'text/plain; charset=utf-8', matched: 'text/plain; charset=utf-8', t } as unknown as TextViewerProps
}

/** Stub `fetch` with one response. */
function stubFetch(response: (url: string, init?: RequestInit) => Promise<Response>): void {
  vi.stubGlobal('fetch', vi.fn(response))
}

describe('textTypeSelector', () => {
  const owner = (mediaType: string): WorkbenchViewerOwnerProps =>
    ({ name: 'a', path: '/a', url: '/u', mediaType })

  it('elects text families and JSON, and declines everything else', () => {
    expect(textTypeSelector(owner('text/plain; charset=utf-8'))).toBe('text/plain; charset=utf-8')
    expect(textTypeSelector(owner('text/csv'))).toBe('text/csv')
    expect(textTypeSelector(owner('application/json; charset=utf-8'))).toBe('application/json; charset=utf-8')
    expect(textTypeSelector(owner('image/png'))).toBeNull()
    expect(textTypeSelector(owner('application/octet-stream'))).toBeNull()
  })

  it('elects a bare text type that carries no parameters', () => {
    expect(textTypeSelector(owner('text/plain'))).toBe('text/plain')
  })
})

describe('TextViewer', () => {
  it('shows the fetched text', async () => {
    stubFetch(() => Promise.resolve(new Response('const a = 1\n')))
    render(<TextViewer {...props()} />)
    expect(await screen.findByText('const a = 1')).toBeTruthy()
  })

  it('reports a failing response status', async () => {
    stubFetch(() => Promise.resolve(new Response('nope', { status: 404 })))
    render(<TextViewer {...props()} />)
    expect(await screen.findByText(/HTTP 404/)).toBeTruthy()
  })

  it('stringifies a non-Error fetch rejection', async () => {
    // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- the non-Error rejection is the scenario under test.
    stubFetch(() => Promise.reject('offline'))
    render(<TextViewer {...props()} />)
    expect(await screen.findByText(/offline/)).toBeTruthy()
  })

  it('truncates a file larger than the preview cap', async () => {
    stubFetch(() => Promise.resolve(new Response('x'.repeat(TEXT_PREVIEW_LIMIT + 5))))
    const { container } = render(<TextViewer {...props()} />)
    await waitFor(() => { expect(container.querySelector('pre')?.textContent).toHaveLength(TEXT_PREVIEW_LIMIT) })
    expect(screen.getByText(new RegExp(String(TEXT_PREVIEW_LIMIT)))).toBeTruthy()
  })

  it('shows the loading placeholder while the read is in flight', async () => {
    stubFetch(() => new Promise<Response>(() => {}))
    render(<TextViewer {...props()} />)
    expect(screen.getByText(zh['viewer.loading'])).toBeTruthy()
  })

  it('reports an Error rejection from fetch and a non-Error rejection from the body read', async () => {
    stubFetch(() => Promise.reject(new Error('network down')))
    const { unmount } = render(<TextViewer {...props()} />)
    expect(await screen.findByText(/network down/)).toBeTruthy()
    unmount()

    stubFetch(() => Promise.resolve({
      ok: true,
      // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- the non-Error rejection is the scenario under test.
      text: () => Promise.reject('decode failed'),
    } as unknown as Response))
    render(<TextViewer {...props()} />)
    expect(await screen.findByText(/decode failed/)).toBeTruthy()
  })

  it('suppresses a failure that arrives after unmount', async () => {
    let fail: ((cause: unknown) => void) | undefined
    stubFetch(() => new Promise<Response>((_resolve, reject) => { fail = reject }))
    const { unmount } = render(<TextViewer {...props()} />)
    unmount()
    fail?.(new Error('too late'))
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    expect(screen.queryByText(/too late/)).toBeNull()
    expect(screen.queryByText(/读取文件失败/)).toBeNull()
  })

  it('ignores a body that settles after unmount', async () => {
    let settle: ((response: Response) => void) | undefined
    stubFetch(() => new Promise<Response>((resolve) => { settle = resolve }))
    const { unmount } = render(<TextViewer {...props()} />)
    unmount()
    settle?.(new Response('late'))
    // Let the body read and its settlement handler run after the abort.
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    expect(screen.queryByText('late')).toBeNull()
  })

  it('aborts the read on unmount without reporting a failure', async () => {
    let seen: AbortSignal | undefined
    stubFetch((_url, init) => {
      seen = init?.signal ?? undefined
      return new Promise<Response>(() => {})
    })
    const { unmount } = render(<TextViewer {...props()} />)
    unmount()
    expect(seen?.aborted).toBe(true)
    // The pending read never settles, so nothing renders a failure notice.
    expect(screen.queryByText(/读取文件失败/)).toBeNull()
  })
})
