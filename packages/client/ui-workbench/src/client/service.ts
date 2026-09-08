/**
 * WorkbenchController: the browser-side face of the shared workbench. It owns
 * no view state of its own — the host service is the single authority — and
 * projects the committed view onto the shell's selection store and ui-layout's
 * column geometry. Every gesture routes through a Remote call and returns to
 * this same projection through the `workbench/changed` push, so a human click
 * and an agent tool call land on one state.
 */
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { WorkbenchView } from '@deepseek-ai/dsh-workbench/types'
import type { WorkbenchFileRef } from './contract/slots.ts'
import type { createWorkbenchStore } from './stores.ts'

/** The workbench store's bound action set (framework-baked, draft params peeled). */
export type WorkbenchActions = BoundActions<ReturnType<typeof createWorkbenchStore>>

/** The layout transitions a committed view projects onto (ui-layout's `ctx.layout`). */
export interface WorkbenchLayoutFace {
  /** Open the workbench column (no-op when already open). */
  openWorkbench(): void
  /** Close the workbench column. */
  closeWorkbench(): void
}

/** The generated Remote namespace this controller drives. */
export interface WorkbenchRemoteFace {
  state(): Promise<RemoteResult<WorkbenchView>>
  open(panelId: string | null): Promise<RemoteResult<WorkbenchView>>
  close(): Promise<RemoteResult<WorkbenchView>>
  select(panelId: string): Promise<RemoteResult<WorkbenchView>>
  toggle(): Promise<RemoteResult<WorkbenchView>>
}

/** The outward workbench face (`ctx.workbench`). */
export interface IWorkbench {
  /**
   * Open the workbench column, selecting a panel when one is named.
   * @param panelId - panel id to select; omitted keeps the host's selection.
   * @returns a promise settling after the committed view was applied.
   */
  open(panelId?: string): Promise<void>
  /** Close the workbench column. */
  close(): Promise<void>
  /** Toggle the workbench column. */
  toggle(): Promise<void>
  /**
   * Show one file in the viewer chain, opening the column.
   * @param file - the file a panel selected, including its byte URL.
   */
  preview(file: WorkbenchFileRef): void
  /** Close the viewer chain without changing the selected panel. */
  closeFile(): void
}

/** Cross-plugin workbench face (`ctx.workbench`). */
export class WorkbenchController implements IWorkbench {
  #actions: WorkbenchActions | undefined
  #pending: WorkbenchView | undefined
  #layout: WorkbenchLayoutFace
  #remote: WorkbenchRemoteFace

  /**
   * @param layout - the layout face a committed view projects onto.
   * @param remote - the generated workbench Remote namespace.
   */
  constructor(layout: WorkbenchLayoutFace, remote: WorkbenchRemoteFace) {
    this.#layout = layout
    this.#remote = remote
  }

  /**
   * Adopt the shell entry's bound store actions. Called from the registration's
   * inject hook (a sanctioned assembly side effect); a view that arrived before
   * the shell mounted is applied here, so no push is lost.
   * @param actions - bound actions of the entry's workbench store instance.
   */
  attachActions(actions: WorkbenchActions): void {
    this.#actions = actions
    if (this.#pending !== undefined) {
      const view = this.#pending
      this.#pending = undefined
      this.applyView(view)
    }
  }

  /**
   * Project one committed host view onto the selection store and the column.
   * @param view - the committed view.
   */
  applyView(view: WorkbenchView): void {
    if (this.#actions === undefined) {
      this.#pending = view
      return
    }
    if (view.open) this.#layout.openWorkbench()
    else this.#layout.closeWorkbench()
    if (view.active === null) this.#actions.clear()
    else this.#actions.select(view.active)
  }

  /**
   * Open the workbench column, selecting a panel when one is named.
   * @param panelId - panel id to select; omitted keeps the host's selection.
   */
  async open(panelId?: string): Promise<void> {
    await this.#commit(this.#remote.open(panelId ?? null))
  }

  /** Close the workbench column. */
  async close(): Promise<void> {
    await this.#commit(this.#remote.close())
  }

  /** Toggle the workbench column. */
  async toggle(): Promise<void> {
    await this.#commit(this.#remote.toggle())
  }

  /**
   * Show one file in the viewer chain, opening the column.
   * @param file - the file a panel selected, including its byte URL.
   */
  preview(file: WorkbenchFileRef): void {
    // The selection is browser-local (which file this window is looking at),
    // so it never crosses the Remote boundary; only the column's open state
    // and the panel choice are shared with the host and the agent.
    this.#actions?.preview(file)
    this.#layout.openWorkbench()
  }

  /** Close the viewer chain without changing the selected panel. */
  closeFile(): void {
    this.#actions?.closeFile()
  }

  async #commit(call: Promise<RemoteResult<WorkbenchView>>): Promise<void> {
    const result = await call
    // A failed Remote call leaves the previous view in place: the host never
    // committed, so projecting a synthetic value would invent state.
    if (result.ok) this.applyView(result.value)
  }
}
