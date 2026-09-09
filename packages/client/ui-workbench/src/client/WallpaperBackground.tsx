/**
 * The frame's wallpaper layer: the occupant of ui-layout's `shell.background`
 * seat. Renders the chosen image full-bleed behind every column with a scrim
 * that keeps the conversation readable, and hides itself when the image cannot
 * load (a wallpaper from a session that no longer exists).
 */
import { useState } from 'react'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { WallpaperChoice } from './wallpaper.ts'
import css from './WallpaperPanel.module.css'

/** Registrant-private injected share: the observable wallpaper choice. */
export interface WallpaperBackgroundInjected {
  hooks: {
    /** The current wallpaper, or null when none is set. */
    wallpaper: SnapshotStore<WallpaperChoice | null>
  }
}

/** Full composed props for the background layer. */
export type WallpaperBackgroundProps =
  & PropsRuntime<'shell.background'>
  & InjectFace<WallpaperBackgroundInjected>

/**
 * Render the wallpaper layer.
 * @param props - the injected wallpaper observable.
 * @returns the image layer plus scrim, or null when none is set.
 */
export function WallpaperBackground({ useWallpaper }: WallpaperBackgroundProps) {
  const choice = useWallpaper(current => current)
  const [failed, setFailed] = useState<string | undefined>(undefined)
  if (choice === null || failed === choice.url) return null
  return (
    <div className={css.background} data-wallpaper>
      <img
        className={css.backgroundImage}
        src={choice.url}
        alt=""
        onError={() => { setFailed(choice.url) }}
      />
      <div className={css.backgroundScrim} />
    </div>
  )
}
