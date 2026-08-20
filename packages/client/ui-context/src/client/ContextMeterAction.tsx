/** Link from the Context occupancy popover to the complete Context view. */

import type { ContextMeterActionProps } from './slots.ts'
import css from './ContextMeterAction.module.css'

/** Render the optional Context-manager entry. */
export function ContextMeterAction({ close, openContext, t }: ContextMeterActionProps) {
  return (
    <button
      type="button"
      className={css.action}
      title={t('meter.manageHint')}
      onClick={() => {
        openContext()
        close()
      }}
    >
      <span>{t('meter.manage')}</span>
      <span aria-hidden>→</span>
    </button>
  )
}
