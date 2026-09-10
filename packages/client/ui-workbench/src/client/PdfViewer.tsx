/**
 * PDF preview: one chain entry that hands the document to the platform's own
 * PDF viewer.
 *
 * The host already serves `.pdf` as `application/pdf`, and every desktop
 * browser renders that inline in a frame with scrolling, zoom, text selection
 * and search. Pulling a PDF engine into this client to redraw those pages would
 * add about a megabyte to a bundle that loads at start-up, so the frame is the
 * renderer and the fallback link is what a platform without an inline viewer
 * (an Android WebView) gets: an ordinary download the shell hands to the system
 * application that can actually open it.
 */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkbenchViewerOwnerProps } from './contract/slots.ts'
import type { NS } from './locales.ts'
import css from './PdfViewer.module.css'

/**
 * Elect the PDF documents this viewer frames.
 * @param owner - the dispatched file owner share.
 * @returns the elected media type, or null to decline.
 */
export function pdfTypeSelector(owner: WorkbenchViewerOwnerProps): string | null {
  const type = owner.mediaType.replace(/;.*$/, '').trim().toLowerCase()
  return type === 'application/pdf' || owner.name.toLowerCase().endsWith('.pdf') ? owner.mediaType : null
}

/** Props of the PDF viewer: the file owner share, the elected type, and copy. */
export type PdfViewerProps =
  & PropsRuntime<'workbench.viewer'>
  & { matched: string }
  & PropsLocale<typeof NS>

/**
 * Frame one PDF, with the download path beside it for hosts that cannot render
 * it inline.
 * @param props - the file owner share, the elected type, and the locale seat.
 * @returns the framed document and its fallback action.
 */
export function PdfViewer({ url, name, matched, t }: PdfViewerProps) {
  return (
    <div className={css.panel} data-media-type={matched}>
      <iframe className={css.frame} src={url} title={t('viewer.media', { name })} />
      <div className={css.fallback}>
        <span className={css.hint}>{t('viewer.pdfHint')}</span>
        {/* The shell's download listener owns this link, so it opens in whatever
            application the platform uses for PDFs instead of going nowhere. */}
        <a className={css.action} href={url} download={name}>{t('viewer.pdfOpen', { name })}</a>
      </div>
    </div>
  )
}
