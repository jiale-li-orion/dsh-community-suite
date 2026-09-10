// @vitest-environment jsdom
/**
 * Theme panel presentation: every registered theme plus the system
 * preference, the current one marked, and the apply gesture.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'
import type { PluginSkinRow, PluginSkinToggle } from '@deepseek-ai/dsh-plugin-install/types'
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
function props(
  snapshot: ThemeSnapshot = SNAPSHOT,
  skins: () => Promise<readonly PluginSkinRow[]> = () => Promise.resolve([]),
  setSkin: (id: string, enabled: boolean) => Promise<PluginSkinToggle> = () => Promise.resolve({
    id: 'x',
    enabled: true,
    profile: 'web',
  }),
): { props: ThemePanelProps; set: ReturnType<typeof vi.fn>; setSkin: ReturnType<typeof vi.fn> } {
  const store = createSnapshotStore<ThemeSnapshot>(snapshot)
  const set = vi.fn()
  const recorder = vi.fn(setSkin)
  return {
    props: {
      width: 560,
      set,
      skins,
      setSkin: recorder,
      useTheme: (read: (value: ThemeSnapshot) => unknown) => read(store.getSnapshot()),
      t,
    } as unknown as ThemePanelProps,
    set,
    setSkin: recorder,
  }
}

const SKIN: PluginSkinRow = { id: 'ui-skin-maid-atelier', name: '@dsh-external/dsh-client-ui-skin-maid-atelier', enabled: true }

describe('ThemePanel', () => {
  it('lists the three stock preferences and every registered community theme', () => {
    render(<ThemePanel {...props().props} />)
    expect(screen.getByText(zh['theme.system'])).toBeTruthy()
    expect(screen.getByText(zh['theme.light'])).toBeTruthy()
    expect(screen.getByText(zh['theme.dark'])).toBeTruthy()
    // The registered built-ins are the stock rows above, not duplicates.
    expect(screen.queryByText('light')).toBeNull()
    expect(screen.getByText('bloom-aurora')).toBeTruthy()
  })

  it('marks the current preference instead of offering to apply it', () => {
    render(<ThemePanel {...props().props} />)
    // Two rows are marked: `system` is the preference, `light` the resolved theme
    // is not — only the preference matches a row id here.
    expect(screen.getAllByText(zh['theme.active'])).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: zh['theme.apply'] })).toHaveLength(3)
  })

  it('lists the installed skins and toggles one through the injected switch', async () => {
    const { props: composed, setSkin } = props(SNAPSHOT, () => Promise.resolve([SKIN]))
    render(<ThemePanel {...composed} />)
    expect(await screen.findByText(SKIN.name)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['theme.skinDisable'] }))
    await waitFor(() => { expect(setSkin).toHaveBeenCalledWith(SKIN.id, false) })
    // The written state flips the row without another read.
    expect(await screen.findByRole('button', { name: zh['theme.skinEnable'] })).toBeTruthy()
    expect(screen.getByText(zh['theme.skinNotice'])).toBeTruthy()
  })

  it('reports an empty skin list and both failure surfaces', async () => {
    const { unmount } = render(<ThemePanel {...props().props} />)
    expect(await screen.findByText(zh['theme.noSkins'])).toBeTruthy()
    unmount()

    const failingList = () => Promise.reject(new Error('profile unreadable'))
    render(<ThemePanel {...props(SNAPSHOT, failingList as unknown as () => Promise<readonly PluginSkinRow[]>).props} />)
    expect(await screen.findByText(/profile unreadable/)).toBeTruthy()
    cleanup()

    const failingSwitch = () => Promise.reject('no such row')
    render(<ThemePanel {...props(SNAPSHOT, () => Promise.resolve([SKIN]), failingSwitch as unknown as never).props} />)
    fireEvent.click(await screen.findByRole('button', { name: zh['theme.skinDisable'] }))
    expect(await screen.findByText(/no such row/)).toBeTruthy()
  })

  it('marks the stock light preference on its own row', () => {
    const { props: composed } = props({ ...SNAPSHOT, preference: 'light' })
    render(<ThemePanel {...composed} />)
    expect(screen.getAllByText(zh['theme.active'])).toHaveLength(1)
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
