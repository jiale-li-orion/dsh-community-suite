/**
 * Workbench slot contract: the panel seat this shell declares, plus the owner
 * share it passes at each keyed dispatch. The `workbench` column slot itself
 * is declared by ui-layout; this package occupies it.
 * @module @deepseek-ai/dsh-client-ui-workbench/client/contract/slots
 */

import type {} from '@deepseek-ai/dsh-client-ui-layout/client'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * One workbench panel body. Declared by this package's `workbench`
     * registration as a list seat whose entries carry the tab identity: a
     * panel registers with `{ name: 'workbench.panel', id: '<panel id>',
     * order, label }`, and the shell dispatches only the selected one with
     * `{ only: <panel id> }`, so a panel component mounts only while it is
     * selected.
     */
    'workbench.panel': { kind: 'list'; scope: 'root'; owner: WorkbenchPanelOwnerProps }
  }
}

/** Owner share of one workbench panel dispatch. */
export interface WorkbenchPanelOwnerProps {
  /** Rendered workbench column width in px, so a panel can adapt to a narrow column. */
  width: number
}

/** One panel tab the shell renders, derived from the slot registry. */
export interface WorkbenchPanelTab {
  /** Registration key: the panel id used for keyed dispatch. */
  id: string
  /** Display label resolved through the registrant's locale at read time. */
  label: string
  /** Registration order (ascending; ties keep registration order). */
  order: number
}
