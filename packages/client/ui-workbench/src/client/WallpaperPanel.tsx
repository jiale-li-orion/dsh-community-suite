/**
 * The wallpaper panel: browse the current session's workspace and pick one
 * image to paint behind the conversation. Reads the workspace through the same
 * fenced listing the file panel uses, so only files the agent can see are
 * offerable, and writes the choice through the wallpaper service. Directory
 * navigation is component-local state, exactly as in the file panel.
 */
import { useEffect, useState } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkbenchListing } from '@deepseek-ai/dsh-workbench/types'
import { parentPath, selectWallpaperEntries } from './listing.ts'
import type { NS } from './locales.ts'
import type { WallpaperChoice } from './wallpaper.ts'
import css from './WallpaperPanel.module.css'

/** Registrant-private injected share: the fenced listing and the wallpaper face. */
export interface WallpaperPanelInjected {
  /**
   * List one directory inside the session workspace.
   * @param sessionId - session whose cwd fences the listing.
   * @param path - directory to list; null lists the workspace root.
   * @returns the fenced listing.
   */
  list: (sessionId: SessionId, path: string | null) => Promise<WorkbenchListing>
  /**
   * Paint one image behind the conversation.
   * @param choice - the image to set.
   */
  set: (choice: WallpaperChoice) => void
  /** Remove the background image. */
  clear: () => void
  hooks: {
    /** The current wallpaper, or null when none is set. */
    wallpaper: SnapshotStore<WallpaperChoice | null>
  }
}

/** Full composed props for the wallpaper panel. */
export type WallpaperPanelProps =
  & PropsRuntime<'workbench.panel'>
  & InjectFace<WallpaperPanelInjected>
  & PropsLocale<typeof NS>

/**
 * Render the wallpaper panel.
 * @param props - owner width, injected listing/wallpaper faces, and the locale seat.
 * @returns the current choice, the browsed directory's entries, and the clear action.
 */
export function WallpaperPanel({ useSessions, list, set, clear, useWallpaper, t }: WallpaperPanelProps) {
  const sessionId = useSessions(state => state.current)
  const current = useWallpaper(choice => choice)
  const [dir, setDir] = useState<string | null>(null)
  const [listing, setListing] = useState<WorkbenchListing | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (sessionId === undefined) return
    let live = true
    setError(undefined)
    void list(sessionId, dir).then(
      (next) => { if (live) setListing(next) },
      (cause: unknown) => { if (live) setError(cause instanceof Error ? cause.message : String(cause)) },
    )
    return () => { live = false }
  }, [dir, list, sessionId])

  if (sessionId === undefined) return <div className={css.notice}>{t('wallpaper.noSession')}</div>
  if (error !== undefined) return <div className={css.error}>{t('wallpaper.error', { message: error })}</div>

  const { directories, images } = selectWallpaperEntries(listing?.entries ?? [])
  const parent = listing === undefined ? null : parentPath(listing.path, listing.root)
  return (
    <div className={css.panel}>
      <div className={css.current}>
        <span className={css.currentLabel}>{t('wallpaper.current')}</span>
        <span className={css.currentName}>{current === null ? t('wallpaper.none') : current.name}</span>
        <button type="button" className={css.clear} disabled={current === null} onClick={clear}>
          {t('wallpaper.clear')}
        </button>
      </div>
      {listing === undefined
        ? <div className={css.notice} />
        : (
          <>
            <div className={css.path} title={listing.path}>
              {parent === null ? t('wallpaper.root') : listing.path}
            </div>
            <ul className={css.list}>
              {parent !== null && (
                <li>
                  <button type="button" className={css.row} onClick={() => { setDir(parent) }}>
                    <span className={css.icon}>↰</span>
                    <span className={css.name}>{t('wallpaper.parent')}</span>
                  </button>
                </li>
              )}
              {directories.map(entry => (
                <li key={entry.path}>
                  <button type="button" className={css.row} onClick={() => { setDir(entry.path) }}>
                    <span className={css.icon}>▸</span>
                    <span className={css.name}>{entry.name}</span>
                  </button>
                </li>
              ))}
              {images.map(entry => (
                <li key={entry.path} className={css.entry}>
                  <span className={css.name}>{entry.name}</span>
                  <button
                    type="button"
                    className={css.set}
                    onClick={() => { set({ url: wallpaperUrl(listing.fileRoute, sessionId, entry.path), name: entry.name }) }}
                  >
                    {t('wallpaper.set')}
                  </button>
                </li>
              ))}
            </ul>
            {directories.length === 0 && images.length === 0 && <div className={css.notice}>{t('wallpaper.empty')}</div>}
          </>
        )}
    </div>
  )
}

/**
 * Byte URL for one workspace image, built from the listing's advertised route.
 * @param route - the byte route the listing advertised.
 * @param sessionId - current session id.
 * @param path - the entry's workspace-absolute path.
 * @returns the same-origin URL the background layer loads.
 */
function wallpaperUrl(route: string, sessionId: SessionId, path: string): string {
  return `${route}?${new URLSearchParams({ sessionId, path }).toString()}`
}
