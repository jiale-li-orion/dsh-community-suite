// @vitest-environment jsdom
/**
 * Theme panel presentation: every registered theme plus the system
 * preference, the current one marked, and the apply gesture.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'
import { ThemePanel } from '../src/client/ThemePanel.tsx'
import type { ThemePanelProps } from '../src/client/ThemePanel.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(() => { cleanup() })

const t = makeTranslate(zh)

const SNAPSHOT: ThemeSnapshot = {
  preference: 'system',
  active: { id: 'light', colorScheme: 'light', tokens: {} },
  themes: [
    { id: 'light', colorScheme: 'light', tokens: {} },
    { id: 'dark', colorScheme: 'dark', tokens: {} },
    { id: 'bloom-aurora', colorScheme: 'dark', tokens: {} },
  ],
  revision: 1,
}

/**
 * Build the panel's composed props.
 * @param snapshot - the theme state the bound hook reads.
 * @returns composed props plus the setter recorder.
 */
function props(snapshot: ThemeSnapshot = SNAPSHOT): { props: ThemePanelProps; set: ReturnType<typeof vi.fn> } {
  const store = createSnapshotStore<ThemeSnapshot>(snapshot)
  const set = vi.fn()
  return {
    props: {
      width: 560,
      set,
      useTheme: (read: (value: ThemeSnapshot) => unknown) => read(store.getSnapshot()),
      t,
    } as unknown as ThemePanelProps,
    set,
  }
}

describe('ThemePanel', () => {
  it('lists the system preference and every registered theme', () => {
    render(<ThemePanel {...props().props} />)
    expect(screen.getByText(zh['theme.system'])).toBeTruthy()
    expect(screen.getByText('light')).toBeTruthy()
    expect(screen.getByText('dark')).toBeTruthy()
    expect(screen.getByText('bloom-aurora')).toBeTruthy()
  })

  it('marks the current preference instead of offering to apply it', () => {
    render(<ThemePanel {...props().props} />)
    // Two rows are marked: `system` is the preference, `light` the resolved theme
    // is not — only the preference matches a row id here.
    expect(screen.getAllByText(zh['theme.active'])).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: zh['theme.apply'] })).toHaveLength(3)
  })

  it('applies the clicked theme through the injected setter', () => {
    const { props: composed, set } = props()
    render(<ThemePanel {...composed} />)
    const rows = screen.getAllByRole('button', { name: zh['theme.apply'] })
    fireEvent.click(rows[0]!)
    expect(set).toHaveBeenCalledWith('light')
  })

  it('marks the concrete preference as current and offers the system row', () => {
    const { props: composed, set } = props({ ...SNAPSHOT, preference: 'dark' })
    render(<ThemePanel {...composed} />)
    expect(screen.getAllByText(zh['theme.active'])).toHaveLength(1)
    // Only the system row is unmarked here, so it is the one apply button.
    expect(screen.getAllByRole('button', { name: zh['theme.apply'] })).toHaveLength(3)
    fireEvent.click(screen.getAllByRole('button', { name: zh['theme.apply'] })[0]!)
    expect(set).toHaveBeenCalledWith('system')
  })
})
