// @vitest-environment jsdom
/**
 * WorkbenchShell presentation behavior: the empty state, the tab strip derived
 * from the panel observable, keyed dispatch of exactly the selected panel, the
 * header close/toggle gestures, and the viewer chain for a previewed file.
 * Props are fed directly as the four shares (the framework derives them in
 * production).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { WorkbenchShell } from '../src/client/WorkbenchShell.tsx'
import type { WorkbenchShellProps } from '../src/client/WorkbenchShell.tsx'
import type { WorkbenchFileRef, WorkbenchPanelTab } from '../src/client/contract/slots.ts'
import { zh } from '../src/client/locales.ts'

afterEach(() => { cleanup() })

const t = makeTranslate(zh)

const FILE: WorkbenchFileRef = {
  name: 'photo.png',
  path: '/w/photo.png',
  url: '/workbench/file?sessionId=s&path=%2Fw%2Fphoto.png',
  mediaType: 'image/png',
}

/**
 * Build the four-share props over real snapshot stores.
 * @param tabs - panel tabs the observable publishes.
 * @param selected - initial store selection.
 * @param file - initial previewed file.
 * @returns composed props plus the recorders a test asserts on.
 */
function props(
  tabs: readonly WorkbenchPanelTab[],
  selected: string | null = null,
  file: WorkbenchFileRef | null = null,
  width = 560,
): {
  props: WorkbenchShellProps
  select: ReturnType<typeof vi.fn>
  renderSlot: ReturnType<typeof vi.fn>
  renderSlotChain: ReturnType<typeof vi.fn>
} {
  const panels = createSnapshotStore<readonly WorkbenchPanelTab[]>(tabs)
  const select = vi.fn()
  const renderSlot = vi.fn(() => null)
  const renderSlotChain = vi.fn(() => <span data-testid="chain" />)
  return {
    props: {
      collapsed: false,
      width,
      useStore: (read: (s: { active: string | null; file: WorkbenchFileRef | null }) => unknown) =>
        read({ active: selected, file }),
      actions: { select, clear: vi.fn(), preview: vi.fn(), closeFile: vi.fn() },
      usePanels: (read: (s: readonly WorkbenchPanelTab[]) => unknown) => read(panels.getSnapshot()),
      renderSlot,
      renderSlotChain,
      toggle: vi.fn(),
      closeFile: vi.fn(),
      t,
    } as unknown as WorkbenchShellProps,
    select,
    renderSlot,
    renderSlotChain,
  }
}

const TWO_PANELS: readonly WorkbenchPanelTab[] = [
  { id: 'files', label: '文件', order: 10 },
  { id: 'terminal', label: '终端', order: 20 },
]

describe('WorkbenchShell', () => {
  it('renders the empty state and no tab strip while no panel is registered', () => {
    const { props: shellProps } = props([])
    render(<WorkbenchShell {...shellProps} />)
    expect(screen.getByText(zh['empty.title'])).toBeTruthy()
    expect(screen.getByText(zh['empty.hint'])).toBeTruthy()
    expect(screen.queryByRole('navigation')).toBeNull()
  })

  it('renders nothing at all while the column is collapsed', () => {
    const { props: shellProps } = props(TWO_PANELS)
    const { container } = render(<WorkbenchShell {...{ ...shellProps, collapsed: true }} />)
    // A closed column stays mounted (the selection store survives) but must not
    // enter the page's accessibility tree.
    expect(container.innerHTML).toBe('')
  })

  it('dispatches the first registered panel through keyed dispatch when nothing is selected', () => {
    const { props: shellProps, renderSlot } = props(TWO_PANELS)
    render(<WorkbenchShell {...shellProps} />)
    expect(renderSlot).toHaveBeenCalledWith('workbench.panel', { width: 560 }, { only: 'files' })
  })

  it('dispatches the selected panel, not the first, when the selection is registered', () => {
    const { props: shellProps, renderSlot } = props(TWO_PANELS, 'terminal')
    render(<WorkbenchShell {...shellProps} />)
    expect(renderSlot).toHaveBeenCalledWith('workbench.panel', { width: 560 }, { only: 'terminal' })
  })

  it('renders one tab per panel and writes the selection on click', () => {
    const { props: shellProps, select } = props(TWO_PANELS)
    render(<WorkbenchShell {...shellProps} />)
    fireEvent.click(screen.getByRole('button', { name: '终端' }))
    expect(select).toHaveBeenCalledWith('terminal')
  })

  it('hides the tab strip for a single panel and closes through the header button', () => {
    const { props: shellProps } = props([{ id: 'files', label: '文件', order: 10 }])
    render(<WorkbenchShell {...shellProps} />)
    expect(screen.queryByRole('navigation')).toBeNull()
    fireEvent.click(screen.getByTitle(zh['toggle.close']))
    expect(shellProps.toggle).toHaveBeenCalledTimes(1)
  })

  it('falls back to the first panel when the selection names an unregistered panel', () => {
    const { props: shellProps, renderSlot } = props([{ id: 'files', label: '文件', order: 10 }], 'gone')
    render(<WorkbenchShell {...shellProps} />)
    expect(renderSlot).toHaveBeenCalledWith('workbench.panel', { width: 560 }, { only: 'files' })
  })

  it('renders no viewer section until a file is previewed', () => {
    const { props: shellProps, renderSlotChain } = props(TWO_PANELS)
    render(<WorkbenchShell {...shellProps} />)
    expect(renderSlotChain).not.toHaveBeenCalled()
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('dispatches the viewer chain for the previewed file and closes it', () => {
    const { props: shellProps, renderSlotChain } = props(TWO_PANELS, 'files', FILE)
    render(<WorkbenchShell {...shellProps} />)
    const [key, owner, opts] = renderSlotChain.mock.calls[0] as [string, WorkbenchFileRef, { fallback: React.ReactNode }]
    expect(key).toBe('workbench.viewer')
    expect(owner).toEqual(FILE)
    expect(opts.fallback).toBeTruthy()
    expect(screen.getByRole('region', { name: FILE.name })).toBeTruthy()
    expect(screen.getByTitle(FILE.path)).toBeTruthy()
    fireEvent.click(screen.getByTitle(zh['viewer.close']))
    expect(shellProps.closeFile).toHaveBeenCalledTimes(1)
  })

  it('splits the panel and the file side by side in a wide column', () => {
    const { props: shellProps } = props(TWO_PANELS, 'files', FILE, 900)
    const { container } = render(<WorkbenchShell {...shellProps} />)
    const shell = container.firstElementChild as HTMLElement
    expect(shell.hasAttribute('data-pushed')).toBe(false)
    // Both panes are present: the file sits beside the panel, not over it.
    expect(screen.getByRole('region', { name: FILE.name })).toBeTruthy()
    expect(shell.querySelector('[class*="body"]')).toBeTruthy()
  })

  it('pushes the file over the panel in a narrow column and returns through back', () => {
    const { props: shellProps } = props(TWO_PANELS, 'files', FILE, 390)
    const { container } = render(<WorkbenchShell {...shellProps} />)
    const shell = container.firstElementChild as HTMLElement
    expect(shell.hasAttribute('data-pushed')).toBe(true)
    // A phone column shows one page; the way back is a control, not a glyph
    // without a name.
    fireEvent.click(screen.getByRole('button', { name: zh['viewer.back'] }))
    expect(shellProps.closeFile).toHaveBeenCalledTimes(1)
  })

  it('falls back to the no-preview notice when every viewer declines', () => {
    const { props: shellProps, renderSlotChain } = props(TWO_PANELS, 'files', FILE)
    renderSlotChain.mockReturnValue(null)
    render(<WorkbenchShell {...shellProps} />)
    const fallback = (renderSlotChain.mock.calls[0]?.[2] as { fallback: React.ReactNode }).fallback
    const { container } = render(<>{fallback}</>)
    expect(container.textContent).toBe(zh['viewer.unsupported'])
  })
})
