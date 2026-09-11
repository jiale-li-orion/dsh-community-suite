// @vitest-environment jsdom
/**
 * FilePanel presentation behavior: the no-session, loading, error, empty, root,
 * and nested states, plus the navigation gestures that re-list through the
 * injected fenced reader. Props are fed directly as the composed shares.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { WorkbenchListing } from '@deepseek-ai/dsh-workbench/types'
import { FilePanel } from '../src/client/FilePanel.tsx'
import { createFilePanelStore } from '../src/client/file-panel-store.ts'
import type { FilePanelProps } from '../src/client/FilePanel.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(() => { cleanup() })

const t = makeTranslate(zh)


const ROOT: WorkbenchListing = {
  root: '/w',
  path: '/w',
  fileRoute: '/workbench/file',
  uploadRoute: '/workbench/upload',
  entries: [
    { name: 'README.md', type: 'file', path: '/w/README.md', size: 6, mediaType: 'text/plain; charset=utf-8' },
    { name: 'src', type: 'directory', path: '/w/src' },
    { name: 'bundle.js', type: 'file', path: '/w/bundle.js', size: 2048, mediaType: 'application/octet-stream' },
    { name: 'image.png', type: 'file', path: '/w/image.png', size: 2 * 1024 * 1024, mediaType: 'image/png' },
    { name: 'socket', type: 'other', path: '/w/socket' },
  ],
}

const NESTED: WorkbenchListing = {
  root: '/w',
  path: '/w/src',
  fileRoute: '/workbench/file',
  uploadRoute: '/workbench/upload',
  entries: [{ name: 'index.ts', type: 'file', path: '/w/src/index.ts', size: 10 }],
}

/**
 * Build the composed props over a listing reader.
 * @param list - injected fenced listing reader.
 * @param sessionId - current session id, or null for the no-session state.
 * @returns composed props and the preview recorder.
 */
function props(
  list: FilePanelProps['list'],
  sessionId: string | null = 'session-1',
): { props: FilePanelProps; preview: ReturnType<typeof vi.fn>; store: ReturnType<ReturnType<typeof createFilePanelStore>['create']> } {
  const preview = vi.fn()
  // The panel declares its own store for the hidden-entry preference, so the
  // test drives a real instance through the standard engine path.
  const store = createFilePanelStore().create()
  // A store hook subscribes: reading a snapshot once would leave the panel
  // unable to react to its own toggle.
  const subscribe = (listener: () => void): (() => void) => store.subscribe(listener)
  const snapshot = (): { showHidden: boolean } => store.getSnapshot()
  function useStore<T>(read: (state: { showHidden: boolean }) => T): T {
    return read(useSyncExternalStore(subscribe, snapshot))
  }
  return {
    props: {
      useSessions: (read: (state: { current: string | undefined }) => unknown) =>
        read({ current: sessionId ?? undefined }),
      useStore,
      actions: store.actions,
      list,
      preview,
      t,
    } as unknown as FilePanelProps,
    preview,
    store,
  }
}

describe('FilePanel', () => {
  it('shows the empty notice while no session is current', () => {
    const list = vi.fn()
    render(<FilePanel {...props(list, null).props} />)
    expect(screen.getByText(zh['files.empty'])).toBeTruthy()
    expect(list).not.toHaveBeenCalled()
  })

  it('shows the localized error naming the host refusal', async () => {
    const list = vi.fn(() => Promise.reject(new Error('outside the workspace')))
    render(<FilePanel {...props(list).props} />)
    expect(await screen.findByText(/outside the workspace/)).toBeTruthy()
  })

  it('renders the workspace root listing with formatted sizes and a disabled other entry', async () => {
    const list = vi.fn(() => Promise.resolve(ROOT))
    render(<FilePanel {...props(list).props} />)
    expect(await screen.findByText('README.md')).toBeTruthy()
    expect(list).toHaveBeenCalledWith('session-1', null)
    expect(screen.getByText(zh['files.root'])).toBeTruthy()
    // The root is the top level: no parent row.
    expect(screen.queryByText(zh['files.parent'])).toBeNull()
    expect(screen.getByText('6 B')).toBeTruthy()
    expect(screen.getByText('2.0 KB')).toBeTruthy()
    expect(screen.getByText('2.0 MB')).toBeTruthy()
    expect(screen.getByRole('button', { name: /socket/ }).hasAttribute('disabled')).toBe(true)
  })

  it('hides dot-prefixed entries until the toggle asks for them', async () => {
    const list = vi.fn(() => Promise.resolve({
      root: '/w',
      path: '/w',
      fileRoute: '/workbench/file',
      uploadRoute: '/workbench/upload',
      entries: [
        { name: '.git', type: 'directory', path: '/w/.git' },
        { name: '.env', type: 'file', path: '/w/.env', size: 20, mediaType: 'text/plain' },
        { name: 'README.md', type: 'file', path: '/w/README.md', size: 6, mediaType: 'text/plain' },
      ],
    } satisfies WorkbenchListing))
    const built = props(list)
    render(<FilePanel {...built.props} />)
    expect(await screen.findByText('README.md')).toBeTruthy()
    // Configuration is not what someone opens a file tree for.
    expect(screen.queryByText('.git')).toBeNull()
    expect(screen.queryByText('.env')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: zh['files.showHidden'] }))
    expect(built.store.getSnapshot().showHidden).toBe(true)
    expect(screen.getByText('.git')).toBeTruthy()
    expect(screen.getByText('.env')).toBeTruthy()
  })

  it('shows the empty notice for a directory with no children', async () => {
    const list = vi.fn(() => Promise.resolve({ root: '/w', path: '/w', fileRoute: '/workbench/file', uploadRoute: '/workbench/upload', entries: [] } satisfies WorkbenchListing))
    render(<FilePanel {...props(list).props} />)
    expect(await screen.findByText(zh['files.empty'])).toBeTruthy()
  })

  it('re-lists a clicked directory and returns to the root through the parent row', async () => {
    const list = vi.fn((_sessionId: string, path: string | null) =>
      Promise.resolve(path === null || path === ROOT.root ? ROOT : NESTED))
    render(<FilePanel {...props(list as FilePanelProps['list']).props} />)
    fireEvent.click(await screen.findByRole('button', { name: /src/ }))
    await waitFor(() => { expect(list).toHaveBeenLastCalledWith('session-1', '/w/src') })
    expect(await screen.findByText('index.ts')).toBeTruthy()
    // A nested listing names its directory and offers the way back up.
    expect(screen.getByText('/w/src')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: new RegExp(zh['files.parent']) }))
    await waitFor(() => { expect(list).toHaveBeenLastCalledWith('session-1', '/w') })
    expect(await screen.findByText('README.md')).toBeTruthy()
  })

  it('returns to the enclosing directory rather than jumping to the root', async () => {
    const deep: WorkbenchListing = {
      root: '/w',
      path: '/w/src/deep',
      fileRoute: '/workbench/file',
      uploadRoute: '/workbench/upload',
      entries: [{ name: 'leaf.ts', type: 'file', path: '/w/src/deep/leaf.ts', size: 3 }],
    }
    const nestedWithDir: WorkbenchListing = {
      ...NESTED,
      entries: [...NESTED.entries, { name: 'deep', type: 'directory', path: '/w/src/deep' }],
    }
    const list = vi.fn((_sessionId: string, path: string | null) => Promise.resolve(
      path === null ? ROOT : path === '/w/src' ? nestedWithDir : deep,
    ))
    render(<FilePanel {...props(list as FilePanelProps['list']).props} />)
    fireEvent.click(await screen.findByRole('button', { name: /src/ }))
    await waitFor(() => { expect(list).toHaveBeenLastCalledWith('session-1', '/w/src') })
    fireEvent.click(await screen.findByRole('button', { name: /deep/ }))
    await waitFor(() => { expect(list).toHaveBeenLastCalledWith('session-1', '/w/src/deep') })

    fireEvent.click(await screen.findByRole('button', { name: new RegExp(zh['files.parent']) }))
    await waitFor(() => { expect(list).toHaveBeenLastCalledWith('session-1', '/w/src') })
    expect(await screen.findByText('index.ts')).toBeTruthy()
  })

  it('clicking a file row requests a preview with its byte URL and media type', async () => {
    const list = vi.fn(() => Promise.resolve(ROOT))
    const { props: panelProps, preview } = props(list)
    render(<FilePanel {...panelProps} />)
    fireEvent.click(await screen.findByRole('button', { name: /image\.png/ }))
    expect(preview).toHaveBeenCalledWith({
      name: 'image.png',
      path: '/w/image.png',
      url: `/workbench/file?${new URLSearchParams({ sessionId: 'session-1', path: '/w/image.png' }).toString()}`,
      mediaType: 'image/png',
    })
    // Previewing a file never re-lists the directory.
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('falls back to a download media type when a file entry carries none', async () => {
    const list = vi.fn(() => Promise.resolve({
      root: '/w',
      path: '/w',
      fileRoute: '/workbench/file',
      uploadRoute: '/workbench/upload',
      entries: [{ name: 'blob', type: 'file', path: '/w/blob' }],
    } satisfies WorkbenchListing))
    const { props: panelProps, preview } = props(list)
    render(<FilePanel {...panelProps} />)
    fireEvent.click(await screen.findByRole('button', { name: /blob/ }))
    expect(preview).toHaveBeenCalledWith(expect.objectContaining({ mediaType: 'application/octet-stream' }))
  })

  it('ignores a listing that settles after unmount', async () => {
    let resolveListing: ((listing: WorkbenchListing) => void) | undefined
    const list = vi.fn((_sessionId: string, path: string | null) => new Promise<WorkbenchListing>((resolve) => {
      resolveListing = resolve
      expect(path).toBeNull()
    }))
    const { unmount } = render(<FilePanel {...props(list as FilePanelProps['list']).props} />)
    unmount()
    // The reader outlives the component: the settlement must not touch state.
    if (resolveListing !== undefined) resolveListing(ROOT)
    await Promise.resolve()
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('ignores a rejection that arrives after unmount', async () => {
    let rejectListing: ((cause: unknown) => void) | undefined
    const list = vi.fn((_sessionId: string, path: string | null) => new Promise<WorkbenchListing>((_resolve, reject) => {
      rejectListing = reject
      expect(path).toBeNull()
    }))
    const { unmount } = render(<FilePanel {...props(list as FilePanelProps['list']).props} />)
    unmount()
    if (rejectListing !== undefined) rejectListing(new Error('gone'))
    await Promise.resolve()
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('renders a non-Error rejection through its string form', async () => {
    // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- the non-Error rejection is the scenario under test.
    const list = vi.fn(() => Promise.reject('plain failure'))
    render(<FilePanel {...props(list).props} />)
    expect(await screen.findByText(/plain failure/)).toBeTruthy()
  })
})
