/**
 * Shared workbench state. One service owns the view the browser and the agent
 * both mutate: browser gestures arrive as Remote calls, the `tool-workbench`
 * tools write the same value, and every commit emits `workbench/changed` so both
 * projections converge without polling. The service also answers the file
 * panel's fenced directory listings, so the panel reads the workspace through
 * the same `fs` capability the agent uses rather than a private path walk.
 * @module @deepseek-ai/dsh-workbench
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-session'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { contentTypeForPath } from './content-type.ts'
import { fenceSessionPath } from './fence.ts'
import { WORKBENCH_FILE_PATH } from './protocol.ts'
import type { WorkbenchDirEntry, WorkbenchListing, WorkbenchView } from './types.ts'

export type * from './types.ts'
export { contentTypeForPath, DEFAULT_CONTENT_TYPE } from './content-type.ts'
export { fenceSessionPath, WorkbenchFenceError } from './fence.ts'
export { WORKBENCH_FILE_PATH } from './protocol.ts'
export type { FencedSessionPath } from './fence.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The shared workbench state service. */
    workbench: WorkbenchService
  }
}

/**
 * The shared workbench service. A single mutable view plus the fenced listing
 * the file panel reads; every commit is one assignment and one event, so there
 * is no second state to keep synchronized.
 */
export class WorkbenchService extends TypertRemoteService {
  static inject = ['fs', 'sessions']

  // A plain `private` field, not `#view`: cordis proxies the service instance,
  // and JavaScript private fields are not proxy-transparent.
  private view: WorkbenchView = { open: false, active: null }

  /**
   * @param ctx - owning Cordis context carrying the `fs` and `sessions` services.
   */
  constructor(ctx: Context) {
    super(ctx, 'workbench')
  }

  /**
   * Read the current view.
   * @returns a detached copy of the committed view.
   */
  @Remote('state')
  state(): WorkbenchView {
    return { ...this.view }
  }

  /**
   * Open the workbench, optionally selecting a panel.
   * @param panelId - panel id to select, or null to keep the current selection.
   * @returns the committed view.
   */
  @Remote('open')
  open(panelId: string | null): WorkbenchView {
    return this.commit({ open: true, active: panelId ?? this.view.active })
  }

  /**
   * Close the workbench. The selection is kept, so reopening returns to it.
   * @returns the committed view.
   */
  @Remote('close')
  close(): WorkbenchView {
    return this.commit({ open: false, active: this.view.active })
  }

  /**
   * Select a panel and open the workbench.
   * @param panelId - panel id to select.
   * @returns the committed view.
   */
  @Remote('select')
  select(panelId: string): WorkbenchView {
    return this.commit({ open: true, active: panelId })
  }

  /**
   * Toggle the workbench column: open with the current selection, or close.
   * @returns the committed view.
   */
  @Remote('toggle')
  toggle(): WorkbenchView {
    return this.commit({ open: !this.view.open, active: this.view.active })
  }

  /**
   * List one directory inside the session's recorded working directory. The
   * fence is the session's own `cwd`, resolved through the `fs` capability, so
   * the panel sees exactly the tree the agent operates in.
   * @param sessionId - session whose recorded working directory fences the listing.
   * @param path - absolute or relative path to list; null lists the workspace root.
   * @returns the fenced listing.
   * @throws WorkbenchFenceError when the session records no cwd or the path escapes it.
   */
  @Remote('listDir')
  async listDir(sessionId: SessionId, path: string | null): Promise<WorkbenchListing> {
    const { root, target } = await fenceSessionPath(this.ctx, sessionId, path)
    const entries = await this.ctx.fs.listDir(target)
    return {
      root: root.displayPath,
      path: target.displayPath,
      fileRoute: WORKBENCH_FILE_PATH,
      entries: entries.map(entry => ({
        name: entry.name,
        type: entry.type,
        path: entry.target.displayPath,
        ...entry.size === undefined ? {} : { size: entry.size },
        ...entry.type === 'file' ? { mediaType: contentTypeForPath(entry.name) } : {},
      } satisfies WorkbenchDirEntry)),
    }
  }

  private commit(next: WorkbenchView): WorkbenchView {
    this.view = next
    const committed = { ...next }
    this.ctx.emit('workbench/changed', committed)
    return committed
  }
}

export default WorkbenchService
