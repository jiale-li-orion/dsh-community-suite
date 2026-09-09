// @vitest-environment jsdom
/**
 * Wallpaper presentation: the panel's image rows and gestures, and the frame
 * layer's render/hide behavior.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { WorkbenchListing } from '@deepseek-ai/dsh-workbench/types'
import { WallpaperBackground } from '../src/client/WallpaperBackground.tsx'
import type { WallpaperBackgroundProps } from '../src/client/WallpaperBackground.tsx'
import { WallpaperPanel } from '../src/client/WallpaperPanel.tsx'
import type { WallpaperPanelProps } from '../src/client/WallpaperPanel.tsx'
import type { WallpaperChoice } from '../src/client/wallpaper.ts'
import { zh } from '../src/client/locales.ts'

afterEach(() => { cleanup() })

const t = makeTranslate(zh)

const LISTING: WorkbenchListing = {
  root: '/w',
  path: '/w',
  fileRoute: '/workbench/file',
  entries: [
    { name: 'photo.png', type: 'file', path: '/w/photo.png', size: 10, mediaType: 'image/png' },
    { name: 'notes.txt', type: 'file', path: '/w/notes.txt', size: 4, mediaType: 'text/plain; charset=utf-8' },
    { name: 'src', type: 'directory', path: '/w/src' },
  ],
}

/**
 * Build the panel's composed props.
 * @param list - injected fenced listing reader.
 * @param sessionId - current session id, or null for the no-session state.
 * @param current - the observable wallpaper choice.
 * @returns composed props plus the recorders.
 */
function panelProps(
  list: WallpaperPanelProps['list'],
  sessionId: string | null = 'session-1',
  current: WallpaperChoice | null = null,
): { props: WallpaperPanelProps; set: ReturnType<typeof vi.fn>; clear: ReturnType<typeof vi.fn> } {
  const store = createSnapshotStore<WallpaperChoice | null>(current)
  const set = vi.fn()
  const clear = vi.fn()
  return {
    props: {
      width: 560,
      useSessions: (read: (state: { current: string | undefined }) => unknown) => read({ current: sessionId ?? undefined }),
      list,
      set,
      clear,
      useWallpaper: (read: (value: WallpaperChoice | null) => unknown) => read(store.getSnapshot()),
      t,
    } as unknown as WallpaperPanelProps,
    set,
    clear,
  }
}

describe('WallpaperPanel', () => {
  it('asks for a session before listing images', () => {
    const list = vi.fn()
    render(<WallpaperPanel {...panelProps(list as WallpaperPanelProps['list'], null).props} />)
    expect(screen.getByText(zh['wallpaper.noSession'])).toBeTruthy()
    expect(list).not.toHaveBeenCalled()
  })

  it('lists only image files and sets the byte URL on click', async () => {
    const list = vi.fn(() => Promise.resolve(LISTING))
    const { props, set } = panelProps(list)
    render(<WallpaperPanel {...props} />)
    expect(await screen.findByText('photo.png')).toBeTruthy()
    expect(screen.queryByText('notes.txt')).toBeNull()
    expect(screen.queryByText('src')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: zh['wallpaper.set'] }))
    expect(set).toHaveBeenCalledWith({
      url: `/workbench/file?${new URLSearchParams({ sessionId: 'session-1', path: '/w/photo.png' }).toString()}`,
      name: 'photo.png',
    })
  })

  it('reports an empty workspace root and a failed listing', async () => {
    const empty = vi.fn(() => Promise.resolve({ ...LISTING, entries: [] }))
    const { unmount } = render(<WallpaperPanel {...panelProps(empty as WallpaperPanelProps['list']).props} />)
    expect(await screen.findByText(zh['wallpaper.empty'])).toBeTruthy()
    unmount()

    const failing = vi.fn(() => Promise.reject(new Error('fence refused')))
    render(<WallpaperPanel {...panelProps(failing as WallpaperPanelProps['list']).props} />)
    expect(await screen.findByText(/fence refused/)).toBeTruthy()
  })

  it('stringifies a non-Error listing rejection and ignores one that settles after unmount', async () => {
    // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- the non-Error rejection is the scenario under test.
    const plain = vi.fn(() => Promise.reject('plain failure'))
    const { unmount } = render(<WallpaperPanel {...panelProps(plain as WallpaperPanelProps['list']).props} />)
    expect(await screen.findByText(/plain failure/)).toBeTruthy()
    unmount()

    let rejectListing: ((cause: unknown) => void) | undefined
    const pending = vi.fn((_sessionId: string, path: string | null) => new Promise<WorkbenchListing>((_resolve, reject) => {
      rejectListing = reject
      expect(path).toBeNull()
    }))
    const late = render(<WallpaperPanel {...panelProps(pending as WallpaperPanelProps['list']).props} />)
    late.unmount()
    if (rejectListing !== undefined) rejectListing(new Error('gone'))
    await Promise.resolve()
    expect(pending).toHaveBeenCalledTimes(1)
  })

  it('shows the current choice and clears it, disabling clear while none is set', () => {
    const list = vi.fn(() => Promise.resolve(LISTING))
    const { props, clear } = panelProps(list, 'session-1', { url: '/u', name: 'a.png' })
    render(<WallpaperPanel {...props} />)
    expect(screen.getByText('a.png')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['wallpaper.clear'] }))
    expect(clear).toHaveBeenCalledTimes(1)

    cleanup()
    const none = panelProps(vi.fn(() => Promise.resolve(LISTING)))
    render(<WallpaperPanel {...none.props} />)
    expect(screen.getByText(zh['wallpaper.none'])).toBeTruthy()
    expect(screen.getByRole('button', { name: zh['wallpaper.clear'] }).hasAttribute('disabled')).toBe(true)
  })
})

describe('WallpaperBackground', () => {
  /**
   * Build the layer's composed props.
   * @param current - the observable wallpaper choice.
   * @returns composed props.
   */
  function backgroundProps(current: WallpaperChoice | null): WallpaperBackgroundProps {
    const store = createSnapshotStore<WallpaperChoice | null>(current)
    return {
      useWallpaper: (read: (value: WallpaperChoice | null) => unknown) => read(store.getSnapshot()),
    } as unknown as WallpaperBackgroundProps
  }

  it('renders nothing while no wallpaper is set', () => {
    const { container } = render(<WallpaperBackground {...backgroundProps(null)} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders the image with a scrim', () => {
    const { container } = render(<WallpaperBackground {...backgroundProps({ url: '/u', name: 'a.png' })} />)
    const image = container.querySelector('img')
    expect(image?.getAttribute('src')).toBe('/u')
    expect(image?.getAttribute('alt')).toBe('')
    expect(container.querySelector('[data-wallpaper]')).toBeTruthy()
  })

  it('hides itself when the image cannot load', () => {
    const { container } = render(<WallpaperBackground {...backgroundProps({ url: '/gone', name: 'gone.png' })} />)
    const image = container.querySelector('img')
    if (image === null) throw new Error('expected the wallpaper image to render')
    fireEvent.error(image)
    expect(container.innerHTML).toBe('')
  })
})
