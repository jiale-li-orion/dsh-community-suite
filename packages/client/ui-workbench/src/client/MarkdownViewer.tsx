/**
 * Markdown preview: one chain entry that renders a document instead of showing
 * its source. It reuses the renderer the conversation already uses, so a
 * previewed document and a document pasted into a message look the same,
 * including headings, tables, math, and highlighted code fences.
 */
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkbenchViewerOwnerProps } from './contract/slots.ts'
import { isMarkdownFile } from './preview-language.ts'
import { useFileText } from './use-file-text.ts'
import type { NS } from './locales.ts'
import css from './MarkdownViewer.module.css'

/**
 * Elect the Markdown documents this viewer renders.
 * @param owner - the dispatched file owner share.
 * @returns the elected media type, or null to decline.
 */
export function markdownTypeSelector(owner: WorkbenchViewerOwnerProps): string | null {
  return isMarkdownFile(owner.name, owner.mediaType) ? owner.mediaType : null
}

/** Props of the Markdown viewer: the file owner share, the elected type, and copy. */
export type MarkdownViewerProps =
  & PropsRuntime<'workbench.viewer'>
  & { matched: string }
  & PropsLocale<typeof NS>

/**
 * Render one Markdown document.
 * @param props - the file owner share, the elected type, and the locale seat.
 * @returns the rendered document, a loading placeholder, or the failure notice.
 */
export function MarkdownViewer({ url, matched, t }: MarkdownViewerProps) {
  const { text, error } = useFileText(url)
  if (error !== undefined) return <div className={css.error}>{t('viewer.textError', { message: error })}</div>
  if (text === undefined) return <div className={css.notice}>{t('viewer.loading')}</div>
  return (
    <div className={css.panel} data-media-type={matched}>
      <div className={css.document}>
        <MarkdownText text={text} />
      </div>
    </div>
  )
}
