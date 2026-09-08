/**
 * The workbench shell store: which panel is selected and which file the viewer
 * shows. Column geometry belongs to ui-layout's layout store, panel membership
 * belongs to the slot registry, and the file's bytes belong to the host; this
 * store owns only the two browser-local selections the shell renders from.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'
import type { WorkbenchFileRef } from './contract/slots.ts'

/**
 * Workbench store state: the selected panel id (`null` falls back to the first
 * registered panel) and the file shown in the viewer chain (`null` closes it).
 */
type WorkbenchState = { active: string | null; file: WorkbenchFileRef | null }

/**
 * Annotation twin of the actions literal below (the export needs a declared
 * return type); drift fails assignability at the defineStore call.
 */
type WorkbenchActions = {
  select: (draft: WorkbenchState, panelId: string) => void
  clear: (draft: WorkbenchState) => void
  preview: (draft: WorkbenchState, file: WorkbenchFileRef) => void
  closeFile: (draft: WorkbenchState) => void
}

/**
 * Create the workbench shell store handle.
 * @returns the store handle (spec + type + identity + factory in one).
 */
export function createWorkbenchStore(): EngineStoreHandle<WorkbenchState, WorkbenchActions> {
  return defineStore({
    init: (): WorkbenchState => ({ active: null, file: null }),
    actions: {
      select: (d, panelId: string) => { d.active = panelId },
      clear: (d) => { d.active = null },
      preview: (d, file: WorkbenchFileRef) => { d.file = file },
      closeFile: (d) => { d.file = null },
    },
  })
}
