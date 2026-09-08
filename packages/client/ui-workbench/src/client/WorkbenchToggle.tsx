/**
 * Session-header workbench toggle: opens or closes the workbench column. The
 * button carries no live column state — the shell's own header owns close and
 * the layout face owns the transition — so this entry is a pure trigger.
 */
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { NS } from './locales.ts'
import css from './WorkbenchToggle.module.css'

/** Registrant-private injected share: the column transition. */
export interface WorkbenchToggleInjected {
  /** Toggle the workbench column. */
  toggle: () => void
}

/** Full composed props for the session-header workbench toggle. */
export type WorkbenchToggleProps =
  & PropsRuntime<'conversation.session.header.utilities'>
  & InjectFace<WorkbenchToggleInjected>
  & PropsLocale<typeof NS>

/**
 * Render the workbench toggle button.
 * @param props - runtime share, injected toggle, and the locale seat.
 * @returns the header button.
 */
export function WorkbenchToggle({ toggle, t }: WorkbenchToggleProps) {
  return (
    <button type="button" className={css.toggle} title={t('toggle.open')} onClick={toggle}>
      {t('title')}
    </button>
  )
}
