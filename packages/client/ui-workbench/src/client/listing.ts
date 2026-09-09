/**
 * Listing arithmetic shared by the workbench panels. Both panels walk the same
 * fenced listings, so the way a listing names its own directory and the way a
 * panel returns to the enclosing one live here instead of in each component.
 * @module @deepseek-ai/dsh-client-ui-workbench/client/listing
 */

import type { WorkbenchDirEntry } from '@deepseek-ai/dsh-workbench/types'

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

/** The wallpaper panel's rows: the directories it can enter and the images it can set. */
export interface WallpaperEntries {
  /** Subdirectories, in listing order. */
  readonly directories: readonly WorkbenchDirEntry[]
  /** Image files, in listing order. */
  readonly images: readonly WorkbenchDirEntry[]
}

/**
 * Split one listing into what the wallpaper panel offers.
 * @param entries - the listing's entries.
 * @returns the directories to enter and the images to set.
 */
export function selectWallpaperEntries(entries: readonly WorkbenchDirEntry[]): WallpaperEntries {
  return {
    directories: entries.filter(entry => entry.type === 'directory'),
    images: entries.filter(entry => entry.type === 'file' && entry.mediaType?.startsWith('image/') === true),
  }
}
