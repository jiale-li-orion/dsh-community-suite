/**
 * Built-in workbench viewers: one chain entry per media family. Each selector
 * elects the media type the host listing reported (`image/*`, `audio/*`,
 * `video/*`) and the component renders the matching element against the byte
 * route URL, so the browser streams the file instead of the page holding it.
 * A type nothing elects falls to the shell's "no preview" notice, which is why
 * the selectors stay pure functions of the owner props.
 */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkbenchViewerOwnerProps } from './contract/slots.ts'
import type { NS } from './locales.ts'
import css from './MediaViewer.module.css'

/** The media-type families the built-in viewers render. */
export type MediaFamily = 'image' | 'audio' | 'video'

/** Props of one built-in viewer: the file owner share, the elected type, and copy. */
export type MediaViewerProps =
  & PropsRuntime<'workbench.viewer'>
  & { matched: string }
  & PropsLocale<typeof NS>

/**
 * Build the selector that elects one media family.
 * @param family - the family this entry renders.
 * @returns a pure selector returning the elected media type, or null to decline.
 */
export function mediaTypeSelector(family: MediaFamily): (owner: WorkbenchViewerOwnerProps) => string | null {
  return owner => owner.mediaType.startsWith(`${family}/`) ? owner.mediaType : null
}

/**
 * Build the component for one media family.
 * @param family - the family this component renders.
 * @returns a component rendering the family's element.
 */
export function createMediaViewer(family: MediaFamily): (props: MediaViewerProps) => React.ReactNode {
  return function MediaViewer({ name, url, matched, t }: MediaViewerProps) {
    const label = t('viewer.media', { name })
    // `matched` is the media type this entry's selector elected; it rides the
    // element as a styling and diagnostics hook, never as a source of truth.
    if (family === 'image') return <img className={css.image} src={url} alt={name} data-media-type={matched} />
    if (family === 'audio') {
      return <audio className={css.audio} src={url} controls aria-label={label} data-media-type={matched} />
    }
    return <video className={css.video} src={url} controls aria-label={label} data-media-type={matched} />
  }
}
