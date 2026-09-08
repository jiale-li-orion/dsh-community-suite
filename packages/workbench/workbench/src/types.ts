/**
 * Shared workbench vocabulary: the view state one service owns, the directory
 * listing the file panel renders, and the failure a fenced listing reports.
 * @module @deepseek-ai/dsh-workbench/types
 */

/**
 * The shared workbench view. Both the browser and agent tools mutate this one
 * value, so a human gesture and a model tool call converge on the same state.
 */
export interface WorkbenchView {
  /** Whether the workbench column is open. */
  open: boolean
  /**
   * Selected panel id, or `null` when nothing is selected. The host stores the
   * id opaquely: panel membership belongs to the browser's slot registry, so an
   * unknown id is the client's to interpret (it falls back to the first panel).
   */
  active: string | null
}

/** One child of a listed directory. */
export interface WorkbenchDirEntry {
  /** Basename inside the listed directory. */
  name: string
  /** Whether the child is a regular file, a directory, or something else. */
  type: 'file' | 'directory' | 'other'
  /** Backend display path, safe to render. */
  path: string
  /** Byte size of a regular file when the backend reports one. */
  size?: number
  /**
   * Media type of a regular file, chosen from its extension by
   * `contentTypeForPath`; absent for directories and other entries. The viewer
   * chain routes on it and the byte route serves it as `Content-Type`, so the
   * browser never re-derives a type from the name.
   */
  mediaType?: string
}

/**
 * One directory listing, fenced to a session's recorded working directory.
 * `root` is that directory; every entry path is inside it.
 */
export interface WorkbenchListing {
  /** The session's recorded working directory the listing is fenced to. */
  root: string
  /** The listed directory (equal to `root` for the top level). */
  path: string
  /**
   * Path prefix serving every entry's bytes, carrying no query. A client builds
   * `fileRoute?sessionId=<id>&path=<entry path>` for the viewer, so the byte
   * route's location has one home instead of a constant per plane.
   */
  fileRoute: string
  /** Children in backend order. */
  entries: readonly WorkbenchDirEntry[]
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * The shared workbench view changed. Emitted on every commit — a browser
     * gesture, an agent tool call, or a Remote call — so a client can apply the
     * committed value instead of deriving its own.
     * @param view - the committed view state.
     * @mode emit
     */
    'workbench/changed'(view: WorkbenchView): void
  }
}
