/**
 * The workbench panel-selection store: which panel is selected. Column
 * geometry belongs to ui-layout's layout store; panel membership belongs to
 * the slot registry; this store owns only the selection the two ends share.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'

/**
 * Workbench store state: the selected panel id, or null while nothing is
 * selected (the shell then falls back to the first registered panel).
 */
type WorkbenchState = { active: string | null }

/**
 * Annotation twin of the actions literal below (the export needs a declared
 * return type); drift fails assignability at the defineStore call.
 */
type WorkbenchActions = {
  select: (draft: WorkbenchState, panelId: string) => void
  clear: (draft: WorkbenchState) => void
}

/**
 * Create the workbench selection store handle.
 * @returns the store handle (spec + type + identity + factory in one).
 */
export function createWorkbenchStore(): EngineStoreHandle<WorkbenchState, WorkbenchActions> {
  return defineStore({
    init: (): WorkbenchState => ({ active: null }),
    actions: {
      select: (d, panelId: string) => { d.active = panelId },
      clear: (d) => { d.active = null },
    },
  })
}
