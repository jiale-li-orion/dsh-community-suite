/**
 * The appearance panel: the stock palette, every theme a plugin registered on
 * top of it, and the appearance rows the installed bundles contribute. The
 * registry is ui-theme's (`ctx.theme`), so a theme that registers appears here
 * without this package knowing anything about it, and the write goes through
 * the same `setTheme` the Appearance row uses — one preference, one owner. A
 * skin is a whole profile row rather than a token layer, so its switch rewrites
 * the profile patch and takes effect on the next start.
 */
import { useEffect, useState } from 'react'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'
import type { PluginSkinRow, PluginSkinToggle } from '@deepseek-ai/dsh-plugin-install/types'
import type { NS } from './locales.ts'
import css from './ThemePanel.module.css'

/** Registrant-private injected share: the theme registry and its preference write. */
export interface ThemePanelInjected {
  /**
   * Switch the theme preference.
   * @param id - a registered theme id, or the `system` preference.
   */
  set: (id: string) => void
  /**
   * List the appearance rows the installed bundles insert.
   * @returns one entry per row, with its current enablement.
   */
  skins: () => Promise<readonly PluginSkinRow[]>
  /**
   * Enable or disable one appearance row.
   * @param id - the row id.
   * @param enabled - the state to write.
   * @returns the written state.
   */
  setSkin: (id: string, enabled: boolean) => Promise<PluginSkinToggle>
  hooks: {
    /** The live theme registry and preference. */
    theme: HostObservable<ThemeSnapshot>
  }
}

/** Full composed props for the theme panel. */
export type ThemePanelProps =
  & PropsRuntime<'workbench.panel'>
  & InjectFace<ThemePanelInjected>
  & PropsLocale<typeof NS>

/**
 * Render the appearance panel.
 * @param props - owner width, the injected appearance faces, and the locale seat.
 * @returns the theme rows and the skin switches.
 */
export function ThemePanel({ set, skins, setSkin, useTheme, t }: ThemePanelProps) {
  const preference = useTheme(snapshot => snapshot.preference)
  // The three stock preferences first — they are the way back to no community
  // theme — then every theme a plugin registered on top of the stock palette.
  const themes = useTheme(snapshot => snapshot.themes)
  const [skinRows, setSkinRows] = useState<readonly PluginSkinRow[] | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  useEffect(() => {
    let live = true
    void skins().then(
      (next) => { if (live) setSkinRows(next) },
      (cause: unknown) => { if (live) setError(cause instanceof Error ? cause.message : String(cause)) },
    )
    return () => { live = false }
  }, [skins])
  const toggle = (row: PluginSkinRow): void => {
    setError(undefined)
    void setSkin(row.id, !row.enabled).then(
      () => {
        setSkinRows(current => (current ?? []).map(entry =>
          entry.id === row.id ? { ...entry, enabled: !row.enabled } : entry))
      },
      (cause: unknown) => { setError(cause instanceof Error ? cause.message : String(cause)) },
    )
  }
  const rows = [
    { id: 'system', label: t('theme.system') },
    { id: 'light', label: t('theme.light') },
    { id: 'dark', label: t('theme.dark') },
    ...themes
      .filter(theme => theme.id !== 'light' && theme.id !== 'dark')
      .map(theme => ({ id: theme.id, label: theme.id })),
  ]
  return (
    <div className={css.panel}>
      {error !== undefined && <div className={css.error}>{t('theme.error', { message: error })}</div>}
      <ul className={css.list}>
        {rows.map(row => (
          <li key={row.id} className={css.row}>
            <span className={css.name}>{row.label}</span>
            {preference === row.id
              ? <span className={css.active}>{t('theme.active')}</span>
              : (
                <button type="button" className={css.apply} onClick={() => { set(row.id) }}>
                  {t('theme.apply')}
                </button>
              )}
          </li>
        ))}
      </ul>
      <div className={css.section}>{t('theme.skins')}</div>
      <ul className={css.list}>
        {(skinRows ?? []).map(row => (
          <li key={row.id} className={css.row}>
            <span className={css.name} title={row.name}>{row.name}</span>
            <button type="button" className={css.apply} onClick={() => { toggle(row) }}>
              {row.enabled ? t('theme.skinDisable') : t('theme.skinEnable')}
            </button>
          </li>
        ))}
        {skinRows !== undefined && skinRows.length === 0 && <li className={css.notice}>{t('theme.noSkins')}</li>}
      </ul>
      <div className={css.notice}>{t('theme.skinNotice')}</div>
    </div>
  )
}
