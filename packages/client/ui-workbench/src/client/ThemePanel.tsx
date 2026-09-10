/**
 * The theme panel: every theme the browser has registered, plus the built-in
 * light/dark/system preferences, as one list the operator switches from. The
 * registry is ui-theme's (`ctx.theme`), so a community skin that registers a
 * theme appears here without this package knowing anything about it, and the
 * write goes through the same `setTheme` the Appearance row uses — one
 * preference, one owner, no second source of truth.
 */
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'
import type { NS } from './locales.ts'
import css from './ThemePanel.module.css'

/** Registrant-private injected share: the theme registry and its preference write. */
export interface ThemePanelInjected {
  /**
   * Switch the theme preference.
   * @param id - a registered theme id, or the `system` preference.
   */
  set: (id: string) => void
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
 * Render the theme panel.
 * @param props - owner width, the injected theme face, and the locale seat.
 * @returns the preference rows and the registered themes.
 */
export function ThemePanel({ set, useTheme, t }: ThemePanelProps) {
  const preference = useTheme(snapshot => snapshot.preference)
  // The three stock preferences first — they are the way back to no community
  // theme — then every theme a plugin registered on top of the stock palette.
  const themes = useTheme(snapshot => snapshot.themes)
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
    </div>
  )
}
