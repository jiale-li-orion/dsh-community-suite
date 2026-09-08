// @vitest-environment jsdom
/**
 * WorkbenchShell presentation behavior: the empty state, the tab strip derived
 * from the panel observable, keyed dispatch of exactly the selected panel, and
 * the header close/toggle gestures. Props are fed directly as the four shares
 * (the framework derives them in production).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { WorkbenchShell } from '../src/client/WorkbenchShell.tsx'
import type { WorkbenchShellProps } from '../src/client/WorkbenchShell.tsx'
import type { WorkbenchPanelTab } from '../src/client/contract/slots.ts'
import { zh } from '../src/client/locales.ts'

afterEach(() => { cleanup() })

const t = makeTranslate(zh)

/**
 * Build the four-share props over real snapshot stores.
 * @param tabs - panel tabs the observable publishes.
 * @param selected - initial store selection.
 * @returns composed props, the recorded select action, and the dispatch recorder.
 */
function props(tabs: readonly WorkbenchPanelTab[], selected: string | null = null): {
  props: WorkbenchShellProps
  select: ReturnType<typeof vi.fn>
  renderSlot: ReturnType<typeof vi.fn>
} {
  const panels = createSnapshotStore<readonly WorkbenchPanelTab[]>(tabs)
  const select = vi.fn()
  const renderSlot = vi.fn(() => null)
  return {
    props: {
      collapsed: false,
      width: 560,
      useStore: (read: (s: { active: string | null }) => unknown) => read({ active: selected }),
      actions: { select, clear: vi.fn() },
      usePanels: (read: (s: readonly WorkbenchPanelTab[]) => unknown) => read(panels.getSnapshot()),
      renderSlot,
      toggle: vi.fn(),
      t,
    } as unknown as WorkbenchShellProps,
    select,
    renderSlot,
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
})
