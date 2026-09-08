/**
 * Workbench slot contract: the two seats this shell declares — panel bodies
 * and the file viewer chain — plus the owner shares it passes at dispatch. The
 * `workbench` column slot itself is declared by ui-layout; this package
 * occupies it.
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
    /**
     * The viewer for one selected file, declared by the same `workbench`
     * registration as a chain seat: entries register a pure `select(owner)`
     * that elects the media types they render, the shell dispatches through
     * `renderSlotChain`, and an all-declined chain renders the shell's
     * fallback. A panel asks for a preview by writing the file into the
     * shell's selection store, so any panel can reuse the seat.
     */
    'workbench.viewer': { kind: 'chain'; scope: 'root'; owner: WorkbenchViewerOwnerProps }
  }
}

/** Owner share of one workbench panel dispatch. */
export interface WorkbenchPanelOwnerProps {
  /** Rendered workbench column width in px, so a panel can adapt to a narrow column. */
  width: number
}

/** One file the shell shows in the viewer chain. */
export interface WorkbenchFileRef {
  /** Basename shown in the viewer header. */
  name: string
  /** Workspace-absolute path, for display and for the viewer's own diagnostics. */
  path: string
  /** Same-origin URL serving the file's bytes (the `dsh-workbench-bytes` route). */
  url: string
  /** Media type the host serves, as reported by the panel's listing. */
  mediaType: string
}

/** Owner share of one workbench viewer dispatch. */
export type WorkbenchViewerOwnerProps = WorkbenchFileRef

/** One panel tab the shell renders, derived from the slot registry. */
export interface WorkbenchPanelTab {
  /** Registration key: the panel id used for keyed dispatch. */
  id: string
  /** Display label resolved through the registrant's locale at read time. */
  label: string
  /** Registration order (ascending; ties keep registration order). */
  order: number
}
