/**
 * Source preview: one chain entry that shows a source file with its grammar
 * highlighted, using the code renderer the conversation already ships. A file
 * whose extension has no grammar falls through to the plain text viewer, so
 * this entry claims only what it can actually highlight.
 */
import { CodeBlock } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkbenchViewerOwnerProps } from './contract/slots.ts'
import { languageForFile } from './preview-language.ts'
import { useFileText } from './use-file-text.ts'
import type { NS } from './locales.ts'
import css from './CodeViewer.module.css'

/**
 * Elect the source files this viewer highlights.
 * @param owner - the dispatched file owner share.
 * @returns the elected media type, or null to decline.
 */
export function codeTypeSelector(owner: WorkbenchViewerOwnerProps): string | null {
  return languageForFile(owner.name) === undefined ? null : owner.mediaType
}

/** Props of the source viewer: the file owner share, the elected type, and copy. */
export type CodeViewerProps =
  & PropsRuntime<'workbench.viewer'>
  & { matched: string }
  & PropsLocale<typeof NS>

/**
 * Render one source file with its grammar highlighted.
 * @param props - the file owner share, the elected type, and the locale seat.
 * @returns the highlighted source, a loading placeholder, or the failure notice.
 */
export function CodeViewer({ url, name, matched, t }: CodeViewerProps) {
  const { text, error } = useFileText(url)
  if (error !== undefined) return <div className={css.error}>{t('viewer.textError', { message: error })}</div>
  if (text === undefined) return <div className={css.notice}>{t('viewer.loading')}</div>
  const language = languageForFile(name)
  return (
    <div className={css.panel} data-media-type={matched}>
      <CodeBlock
        code={text}
        lang={language}
        copyLabel={t('viewer.copy')}
        copiedLabel={t('viewer.copied')}
      />
    </div>
  )
}
