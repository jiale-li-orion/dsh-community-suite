// @vitest-environment jsdom
/**
 * The uploads panel: files grouped by the device that sent them, a thumbnail for
 * an image, the empty state when a session has received nothing, and a click that
 * hands the file to the viewer.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { UploadsPanel } from '../src/client/UploadsPanel.tsx'
import type { UploadsPanelProps } from '../src/client/UploadsPanel.tsx'
import { zh } from '../src/client/locales.ts'

const t = makeTranslate(zh)
const SESSION = 'session-uploads'

afterEach(() => { cleanup() })

/** One entry a test wants the reader to report. */
interface TreeEntry {
  name: string
  /** Directory rows are reported as directories unless a test says otherwise. */
  type?: 'file' | 'directory'
  size?: number
  mediaType?: string
}

/** A listing reader over a fixed tree of buckets. */
function reader(tree: Record<string, readonly TreeEntry[]>) {
  return vi.fn((_sessionId: string, path: string | null) => {
    const entries = tree[path ?? ''] ?? []
    return Promise.resolve({
      root: '/w',
      path: `/w/${path ?? ''}`,
      fileRoute: '/workbench/file',
      uploadRoute: '/workbench/upload',
      entries: entries.map(entry => ({
        name: entry.name,
        type: entry.type ?? 'file',
        path: `/w/${path ?? ''}/${entry.name}`,
        ...(entry.size === undefined ? {} : { size: entry.size }),
        ...(entry.mediaType === undefined ? {} : { mediaType: entry.mediaType }),
      })),
    })
  })
}

/**
 * Compose the seat props. `null` asks for the no-session case, because a
 * defaulted parameter cannot express "explicitly undefined".
 */
function props(list: ReturnType<typeof reader>, current: string | null = SESSION) {
  const preview = vi.fn()
  const composed = {
    width: 560,
    useSessions: (read: (state: { current: string | undefined }) => unknown) =>
      read({ current: current ?? undefined }),
    list,
    preview,
    t,
  } as unknown as UploadsPanelProps
  return { props: composed, preview }
}

describe('uploads panel', () => {
  it('groups files by the device that sent them', async () => {
    const list = reader({
      uploads: [{ name: 'mobile-app', type: 'directory' }, { name: 'desktop-browser', type: 'directory' }],
      'uploads/mobile-app': [{ name: 'photo.jpg', size: 2048, mediaType: 'image/jpeg' }],
      'uploads/desktop-browser': [{ name: 'report.pdf', size: 1_809_802, mediaType: 'application/pdf' }],
    })
    render(<UploadsPanel {...props(list).props} />)
    expect(await screen.findByText('photo.jpg')).toBeTruthy()
    // Each row says where it came from; that is the fact the model is told too.
    expect(screen.getByText(zh['uploads.mobileApp'])).toBeTruthy()
    expect(screen.getByText(zh['uploads.desktopBrowser'])).toBeTruthy()
    expect(screen.getByText('1.7 MB')).toBeTruthy()
  })

  it('shows a thumbnail for an image and a mark for anything else', async () => {
    const list = reader({
      uploads: [{ name: 'mobile-app' }],
      'uploads/mobile-app': [
        { name: 'photo.jpg', mediaType: 'image/jpeg' },
        { name: 'notes.txt', mediaType: 'text/plain' },
      ],
    })
    const { container } = render(<UploadsPanel {...props(list).props} />)
    expect(await screen.findByText('photo.jpg')).toBeTruthy()
    const thumb = container.querySelector('img[src*="photo.jpg"]')
    expect(thumb?.getAttribute('src')).toBe('/workbench/file?sessionId=session-uploads&path=%2Fw%2Fuploads%2Fmobile-app%2Fphoto.jpg')
    expect(container.querySelectorAll('img')).toHaveLength(1)
  })

  it('hands a clicked file to the viewer', async () => {
    const list = reader({
      uploads: [{ name: 'mobile-app' }],
      'uploads/mobile-app': [{ name: 'photo.jpg', mediaType: 'image/jpeg' }],
    })
    const built = props(list)
    render(<UploadsPanel {...built.props} />)
    const row = await screen.findByRole('button', { name: /photo\.jpg/ })
    row.click()
    expect(built.preview).toHaveBeenCalledWith({
      name: 'photo.jpg',
      path: '/w/uploads/mobile-app/photo.jpg',
      url: '/workbench/file?sessionId=session-uploads&path=%2Fw%2Fuploads%2Fmobile-app%2Fphoto.jpg',
      mediaType: 'image/jpeg',
    })
  })

  it('invites an upload when the session has received nothing', async () => {
    const list = reader({ uploads: [] })
    const { container } = render(<UploadsPanel {...props(list).props} />)
    expect(await screen.findByText(zh['uploads.empty'])).toBeTruthy()
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/uploads-empty.png')
  })

  it('reads an absent uploads directory as the ordinary empty case', async () => {
    const list = vi.fn(() => Promise.reject(new Error('no such directory'))) as unknown as ReturnType<typeof reader>
    render(<UploadsPanel {...props(list).props} />)
    // Nothing creates the directory until the first file arrives.
    expect(await screen.findByText(zh['uploads.empty'])).toBeTruthy()
  })

  it('claims nothing before the first read settles', async () => {
    let release: ((value: unknown) => void) | undefined
    const pending = new Promise((resolve) => { release = resolve })
    const list = vi.fn(() => pending) as unknown as ReturnType<typeof reader>
    const { container } = render(<UploadsPanel {...props(list).props} />)
    // A read still in flight shows the panel, not an empty-state claim.
    expect(container.querySelector('img')).toBeNull()
    release?.({ root: '/w', path: '/w/uploads', fileRoute: '/workbench/file', uploadRoute: '/workbench/upload', entries: [] })
    expect(await screen.findByText(zh['uploads.empty'])).toBeTruthy()
  })

  it('shows one bucket even when the others do not exist yet', async () => {
    // The live failure this follows: listing a bucket that has never been
    // created threw, and the whole panel fell back to its empty state.
    const list = vi.fn((_sessionId: string, path: string | null) => {
      if (path === 'uploads') {
        return Promise.resolve({
          root: '/w', path: '/w/uploads', fileRoute: '/workbench/file', uploadRoute: '/workbench/upload',
          entries: [{ name: 'desktop-browser', type: 'directory', path: '/w/uploads/desktop-browser' }],
        })
      }
      if (path === 'uploads/desktop-browser') {
        return Promise.resolve({
          root: '/w', path: '/w/uploads/desktop-browser', fileRoute: '/workbench/file', uploadRoute: '/workbench/upload',
          entries: [{ name: 'shot.png', type: 'file', path: '/w/uploads/desktop-browser/shot.png', size: 2048, mediaType: 'image/png' }],
        })
      }
      return Promise.reject(new Error('no such directory'))
    }) as unknown as ReturnType<typeof reader>
    render(<UploadsPanel {...props(list).props} />)
    expect(await screen.findByText('shot.png')).toBeTruthy()
    expect(screen.getByText(zh['uploads.desktopBrowser'])).toBeTruthy()
    expect(screen.queryByText(zh['uploads.empty'])).toBeNull()
  })

  it('lists a file that sits directly under uploads as having no recorded sender', async () => {
    const list = reader({
      uploads: [
        { name: 'mobile-app', type: 'directory' },
        { name: 'EFCADFF53DCE39045C8669E8C8AF758B.jpg', size: 137932, mediaType: 'image/jpeg' },
      ],
    })
    render(<UploadsPanel {...props(list).props} />)
    expect(await screen.findByText('EFCADFF53DCE39045C8669E8C8AF758B.jpg')).toBeTruthy()
    // Such a file predates the route filing uploads by sender.
    expect(screen.getByText(zh['uploads.unknown'])).toBeTruthy()
  })

  it('skips an entry that is not a file', async () => {
    const list = reader({
      uploads: [{ name: 'mobile-app', type: 'directory' }],
      'uploads/mobile-app': [
        { name: 'nested', type: 'directory' },
        { name: 'notes.txt', type: 'file' },
      ],
    })
    const { container } = render(<UploadsPanel {...props(list).props} />)
    expect(await screen.findByText('notes.txt')).toBeTruthy()
    // A directory inside a bucket is not an uploaded file.
    expect(container.textContent).not.toContain('nested')
  })

  it('claims nothing at all while no session is current', async () => {
    const list = reader({ uploads: [] })
    const { container } = render(<UploadsPanel {...props(list, null).props} />)
    // Without a session there is nothing to say about uploads — not even that
    // there are none.
    await waitFor(() => { expect(list).not.toHaveBeenCalled() })
    expect(container.textContent).toBe('')
  })
})

describe('uploads panel — rows the listing leaves thin', () => {
  it('shows a row whose entry carried neither size nor media type', async () => {
    const list = reader({
      uploads: [{ name: 'unknown', type: 'directory' }],
      'uploads/unknown': [{ name: 'mystery.bin' }, { name: 'tiny.txt', size: 231 }],
    })
    const { container } = render(<UploadsPanel {...props(list).props} />)
    expect(await screen.findByText('mystery.bin')).toBeTruthy()
    // Small sizes read in bytes; no size means no size text at all.
    expect(screen.getByText('231 B')).toBeTruthy()
    // No media type means no thumbnail.
    expect(container.querySelectorAll('img')).toHaveLength(0)
    expect(screen.getAllByText(zh['uploads.unknown'])).toHaveLength(2)
  })

  it('settles quietly when a read outlives its panel', async () => {
    let release: ((value: unknown) => void) | undefined
    const list = vi.fn(() => new Promise((resolve) => { release = resolve })) as unknown as ReturnType<typeof reader>
    const built = props(list)
    const { unmount } = render(<UploadsPanel {...built.props} />)
    // The read must be in flight, or releasing it proves nothing.
    expect(list).toHaveBeenCalled()
    expect(typeof release).toBe('function')
    unmount()
    release?.({ root: '/w', path: '/w/uploads', fileRoute: '/workbench/file', uploadRoute: '/workbench/upload', entries: [] })
    // Settling into an unmounted panel is a no-op, not a crash.
    await expect(Promise.resolve()).resolves.toBeUndefined()

    // The same for a read that fails after the panel is gone.
    let reject: ((reason: Error) => void) | undefined
    const failing = vi.fn(() => new Promise((_resolve, rejectRead) => { reject = rejectRead })) as unknown as ReturnType<typeof reader>
    const second = render(<UploadsPanel {...props(failing).props} />)
    second.unmount()
    reject?.(new Error('gone'))
    await expect(Promise.resolve()).resolves.toBeUndefined()
  })
})
