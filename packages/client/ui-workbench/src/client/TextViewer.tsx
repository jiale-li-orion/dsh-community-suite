/**
 * Built-in text viewer: one chain entry that elects every text-ish media type
 * the host serves and renders the file's bytes as preformatted text. The bytes
 * come from the same fenced route the media viewers use, so the page never
 * holds a workspace path — and a file larger than the preview cap is shown
 * truncated rather than pulled into memory whole.
 */
import { useEffect, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkbenchViewerOwnerProps } from './contract/slots.ts'
import type { NS } from './locales.ts'
import css from './TextViewer.module.css'

/** Characters the viewer shows before truncating. */
export const TEXT_PREVIEW_LIMIT = 200_000

/**
 * Elect the media types this viewer renders.
 * @param owner - the dispatched file owner share.
 * @returns the elected media type, or null to decline.
 */
export function textTypeSelector(owner: WorkbenchViewerOwnerProps): string | null {
  const type = owner.mediaType.replace(/;.*$/, '').trim()
  return type.startsWith('text/') || type === 'application/json' ? owner.mediaType : null
}

/** Props of the text viewer: the file owner share, the elected type, and copy. */
export type TextViewerProps =
  & PropsRuntime<'workbench.viewer'>
  & { matched: string }
  & PropsLocale<typeof NS>

/**
 * Render one file as text.
 * @param props - the file owner share, the elected type, and the locale seat.
 * @returns the text, a loading placeholder, or the failure notice.
 */
export function TextViewer({ url, matched, t }: TextViewerProps) {
  const [text, setText] = useState<string | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)

  useEffect(() => {
    const abort = new AbortController()
    setText(undefined)
    setError(undefined)
    void fetch(url, { signal: abort.signal }).then(
      (response) => {
        if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
        return response.text()
      },
      (cause: unknown) => { throw cause instanceof Error ? cause : new Error(String(cause)) },
    ).then(
      (body) => { setText(body) },
      (cause: unknown) => {
        // An aborted read is this effect's own teardown, not a failure to show.
        if (abort.signal.aborted) return
        setError(cause instanceof Error ? cause.message : String(cause))
      },
    )
    return () => { abort.abort() }
  }, [url])

  if (error !== undefined) return <div className={css.error}>{t('viewer.textError', { message: error })}</div>
  if (text === undefined) return <div className={css.notice}>{t('viewer.loading')}</div>
  const truncated = text.length > TEXT_PREVIEW_LIMIT
  return (
    <div className={css.panel} data-media-type={matched}>
      {truncated && <div className={css.notice}>{t('viewer.truncated', { limit: String(TEXT_PREVIEW_LIMIT) })}</div>}
      <pre className={css.text}>{truncated ? text.slice(0, TEXT_PREVIEW_LIMIT) : text}</pre>
    </div>
  )
}
