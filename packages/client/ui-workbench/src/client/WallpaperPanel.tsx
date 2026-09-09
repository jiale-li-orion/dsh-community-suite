/**
 * The wallpaper panel: pick one image from the current session's workspace and
 * paint it behind the conversation. Reads the workspace through the same
 * fenced listing the file panel uses, so only files the agent can see are
 * offerable, and writes the choice through the wallpaper service.
 */
import { useEffect, useState } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkbenchListing } from '@deepseek-ai/dsh-workbench/types'
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
 * @returns the image rows, the current choice, and the clear action.
 */
export function WallpaperPanel({ useSessions, list, set, clear, useWallpaper, t }: WallpaperPanelProps) {
  const sessionId = useSessions(state => state.current)
  const current = useWallpaper(choice => choice)
  const [listing, setListing] = useState<WorkbenchListing | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (sessionId === undefined) return
    let live = true
    setError(undefined)
    void list(sessionId, null).then(
      (next) => { if (live) setListing(next) },
      (cause: unknown) => { if (live) setError(cause instanceof Error ? cause.message : String(cause)) },
    )
    return () => { live = false }
  }, [list, sessionId])

  if (sessionId === undefined) return <div className={css.notice}>{t('wallpaper.noSession')}</div>
  if (error !== undefined) return <div className={css.error}>{t('wallpaper.error', { message: error })}</div>
  const images = (listing?.entries ?? []).filter(entry => entry.type === 'file' && entry.mediaType?.startsWith('image/'))
  const route = listing?.fileRoute ?? ''
  return (
    <div className={css.panel}>
      <div className={css.current}>
        <span className={css.currentLabel}>{t('wallpaper.current')}</span>
        <span className={css.currentName}>{current === null ? t('wallpaper.none') : current.name}</span>
        <button type="button" className={css.clear} disabled={current === null} onClick={clear}>
          {t('wallpaper.clear')}
        </button>
      </div>
      {listing === undefined && <div className={css.notice} />}
      {listing !== undefined && images.length === 0 && <div className={css.notice}>{t('wallpaper.empty')}</div>}
      <ul className={css.list}>
        {images.map(entry => (
          <li key={entry.path} className={css.row}>
            <span className={css.name}>{entry.name}</span>
            <button
              type="button"
              className={css.set}
              onClick={() => { set({ url: wallpaperUrl(route, sessionId, entry.path), name: entry.name }) }}
            >
              {t('wallpaper.set')}
            </button>
          </li>
        ))}
      </ul>
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
