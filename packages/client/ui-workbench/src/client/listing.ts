/**
 * Listing arithmetic shared by the workbench panels: how a listing names its
 * own directory and how a panel returns to the enclosing one.
 * @module @deepseek-ai/dsh-client-ui-workbench/client/listing
 */

/**
 * The directory that encloses one listing, or null at the workspace root.
 * Host display paths use the backend separator, so both separators are cut.
 * @param path - the listing's own directory.
 * @param root - the workspace root fencing the listing.
 * @returns the parent directory, or null when the listing is the root.
 */
export function parentPath(path: string, root: string): string | null {
  if (path === root) return null
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  const parent = cut > 0 ? path.slice(0, cut) : root
  return parent.length >= root.length ? parent : root
}
