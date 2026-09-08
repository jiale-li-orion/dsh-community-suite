/**
 * WorkbenchController: the cross-plugin face behind `ctx.workbench`. Panel
 * membership lives in the slot registry and the selection lives in the shell
 * entry's store; this face exposes only the transitions other plugins and
 * commands may trigger, and it is wired by the shell registration's inject
 * hook (the same assembly pattern ui-layout uses for `ctx.layout`).
 */
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
import type { createWorkbenchStore } from './stores.ts'

/** The workbench store's bound action set (framework-baked, draft params peeled). */
export type WorkbenchActions = BoundActions<ReturnType<typeof createWorkbenchStore>>

/** The layout transitions the workbench face delegates to (ui-layout's `ctx.layout`). */
export interface WorkbenchLayoutFace {
  /** Open the workbench column (no-op when already open). */
  openWorkbench(): void
  /** Close the workbench column. */
  closeWorkbench(): void
  /** Toggle the workbench column. */
  toggleWorkbench(): void
}

/** The outward workbench face (`ctx.workbench`): open/close/toggle the column. */
export interface IWorkbench {
  /**
   * Open the workbench column, selecting a panel when one is named.
   * @param panelId - panel id to select; an unknown id still selects (the
   * shell falls back to the first panel while no such panel is registered).
   */
  open(panelId?: string): void
  /** Close the workbench column. */
  close(): void
  /** Toggle the workbench column (open with the current selection, or close). */
  toggle(): void
}

/** Cross-plugin workbench face (`ctx.workbench`). */
export class WorkbenchController implements IWorkbench {
  #actions: WorkbenchActions | undefined
  #layout: WorkbenchLayoutFace

  /**
   * @param layout - the layout face the column transitions delegate to.
   */
  constructor(layout: WorkbenchLayoutFace) {
    this.#layout = layout
  }

  /**
   * Adopt the shell entry's bound store actions. Called from the registration's
   * inject hook (a sanctioned assembly side effect), so the face is live from
   * the entry's first render; a re-register overwrites the stale set.
   * @param actions - bound actions of the entry's workbench store instance.
   */
  attachActions(actions: WorkbenchActions): void {
    this.#actions = actions
  }

  /**
   * Open the workbench column, selecting a panel when one is named.
   * @param panelId - panel id to select; omitted keeps the current selection.
   */
  open(panelId?: string): void {
    if (panelId !== undefined) this.#require().select(panelId)
    this.#layout.openWorkbench()
  }

  /** Close the workbench column. */
  close(): void {
    this.#layout.closeWorkbench()
  }

  /** Toggle the workbench column. */
  toggle(): void {
    this.#layout.toggleWorkbench()
  }

  #require(): WorkbenchActions {
    // Callers are UI gestures or commands, which cannot fire before the shell
    // entry rendered (the inject hook runs in its first render) — reaching
    // this unwired is a boot-order bug, not a race to tolerate.
    if (this.#actions === undefined) throw new Error('workbench: panel actions not wired (shell entry not mounted)')
    return this.#actions
  }
}
