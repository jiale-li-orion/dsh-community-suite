/**
 * Wallpaper state: the image the frame's background layer paints. One snapshot
 * store owns the choice, the panel writes it through the service, and the
 * background entry reads it through its inject `hooks` compartment, so neither
 * registration reaches into the other. The choice persists per browser under a
 * namespaced key; a stale URL (a session that no longer exists) simply fails to
 * load and the layer hides itself.
 * @module @deepseek-ai/dsh-client-ui-workbench/client/wallpaper
 */

import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'

/** The chosen wallpaper: the byte URL plus the file name for display. */
export interface WallpaperChoice {
  /** Same-origin URL serving the image bytes. */
  url: string
  /** Basename shown in the panel's current-choice line. */
  name: string
}

/** The wallpaper face other plugins and the panel call. */
export interface IWallpaper {
  /**
   * Set the background image.
   * @param choice - the image to paint.
   */
  set(choice: WallpaperChoice): void
  /** Remove the background image. */
  clear(): void
}

/** Browser-storage key; namespaced so it cannot collide with another plugin's. */
const STORAGE_KEY = 'dsh.workbench.wallpaper'

/** Read the persisted choice, tolerating absent or unparsable storage. */
function readStored(): WallpaperChoice | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { url, name } = parsed as { url?: unknown; name?: unknown }
    return typeof url === 'string' && typeof name === 'string' ? { url, name } : null
  } catch {
    // Storage may be unavailable (private mode, disabled) or hold another
    // writer's value; either way the wallpaper starts absent.
    return null
  }
}

/** Persist the choice, ignoring a storage that refuses writes. */
function writeStored(choice: WallpaperChoice | null): void {
  try {
    if (choice === null) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(choice))
  } catch {
    // A read-only storage only costs persistence, never the in-memory choice.
  }
}

/**
 * Create the wallpaper store and its outward face.
 * @returns the observable choice and the service other registrations call.
 */
export function createWallpaper(): { store: SnapshotStore<WallpaperChoice | null>; service: IWallpaper } {
  const store = createSnapshotStore<WallpaperChoice | null>(readStored())
  return {
    store,
    service: {
      set: (choice) => { store.set(choice); writeStored(choice) },
      clear: () => { store.set(null); writeStored(null) },
    },
  }
}
