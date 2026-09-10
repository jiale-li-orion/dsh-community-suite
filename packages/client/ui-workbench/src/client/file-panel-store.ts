/**
 * The file panel's own view state: which entries the listing shows. It is
 * declared at the panel's register, so it survives the column being closed and
 * reopened, and it stays browser-local — whether dotfiles are visible is a
 * viewing preference of this window, not part of the shared workbench view.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'

/** File panel state: whether dot-prefixed entries are listed. */
type FilePanelState = { showHidden: boolean }

/**
 * Annotation twin of the actions literal below (the export needs a declared
 * return type); drift fails assignability at the defineStore call.
 */
type FilePanelActions = { setShowHidden: (draft: FilePanelState, value: boolean) => void }

/**
 * Create the file panel's store handle.
 * @returns the store handle (spec + type + identity + factory in one).
 */
export function createFilePanelStore(): EngineStoreHandle<FilePanelState, FilePanelActions> {
  return defineStore({
    // Dot-prefixed entries are configuration far more often than content, so
    // the listing hides them until someone asks for them.
    init: (): FilePanelState => ({ showHidden: false }),
    actions: {
      setShowHidden: (d, value: boolean) => { d.showHidden = value },
    },
  })
}
