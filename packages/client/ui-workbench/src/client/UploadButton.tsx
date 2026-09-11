/**
 * The composer's upload control. It opens this platform's file chooser — the
 * browser's dialog on a desktop, the shell's chooser inside the phone app — and
 * hands the chosen files to the session workspace, leaving their paths in the
 * draft so the person can say what to do with them.
 *
 * The control is a plugin's contribution to the composer's tool row rather than
 * part of the composer: uploading means knowing the session's workspace, which is
 * this package's subject.
 */
import { useRef, useState } from 'react'
import type { PropsLocale, PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { InputZone } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { NS } from './locales.ts'
import css from './UploadButton.module.css'

/** What this control asks its plugin for. */
export interface UploadInjected {
  /**
   * Put one picked file into the session workspace.
   * @param sessionId - the session whose workspace receives it.
   * @param file - the file the person chose.
   * @param ingestId - this attempt's id, so a repeat is answered, not duplicated.
   * @returns the workspace-relative path the file was written to.
   */
  upload: (sessionId: SessionId, file: File, ingestId: string) => Promise<string>
}

/** The composer tool-row seat and the copy; the upload action arrives separately. */
export type UploadButtonProps =
  & PropsRuntime<'conversation.input.left'>
  & InputZone
  & { /** Draft actions the standard kit provides to every composer entry. */
    readonly inputActions: { setDraft(text: string): void } }
  & PropsLocale<typeof NS>

/**
 * Bind the upload action to the seat, whose registration carries no inject face.
 * One component per apply keeps its identity stable across renders.
 * @param upload - the plugin's upload action.
 * @returns the composer entry component.
 */
export function createUploadEntry(upload: UploadInjected['upload']) {
  return function UploadEntry(props: UploadButtonProps) {
    return <UploadButton {...props} upload={upload} />
  }
}

/**
 * Render the upload control.
 * @param props - the composer owner share, the upload action, and the locale seat.
 * @returns the picker button and its hidden input.
 */
export function UploadButton({ session, input, inputActions, upload, t }: UploadButtonProps & InjectFace<UploadInjected>) {
  const picker = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | undefined>(undefined)

  /** Send every chosen file, then name them in the draft. */
  const chosen = async (files: FileList | null): Promise<void> => {
    const picked = [...files ?? []]
    if (picked.length === 0) return
    setBusy(true)
    setFailed(undefined)
    const landed: string[] = []
    try {
      // One id per pick: retrying this selection reuses it, a new selection does not.
      for (const file of picked) landed.push(await upload(session.sessionId, file, crypto.randomUUID()))
      const references = landed.map(path => t('upload.reference', { path })).join('\n')
      const draft = input.draft.trimEnd()
      inputActions.setDraft(draft === '' ? references : `${draft}\n${references}`)
    } catch (error) {
      setFailed(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
      // Clearing lets the same file be picked again after a failure. The input
      // is rendered by this component, so its ref is set whenever this runs.
      /* v8 ignore next -- the input belongs to this component's own render. */
      if (picker.current !== null) picker.current.value = ''
    }
  }

  return (
    <>
      <button
        type='button'
        className={css.upload}
        title={t('upload.pick')}
        aria-label={t('upload.pick')}
        aria-busy={busy || undefined}
        disabled={busy}
        onClick={() => { picker.current?.click() }}
      >
        <svg viewBox='0 0 16 16' width='14' height='14' aria-hidden>
          <path
            d='M8 11V3m0 0L5 6m3-3 3 3M3 12v1.5A1.5 1.5 0 0 0 4.5 15h7a1.5 1.5 0 0 0 1.5-1.5V12'
            fill='none'
            stroke='currentColor'
            strokeWidth='1.4'
            strokeLinecap='round'
            strokeLinejoin='round'
          />
        </svg>
      </button>
      <input
        ref={picker}
        className={css.picker}
        type='file'
        multiple
        tabIndex={-1}
        aria-hidden
        onChange={(event) => { void chosen(event.target.files) }}
      />
      {failed !== undefined && <span className={css.failed} role='alert'>{t('upload.failed', { reason: failed })}</span>}
    </>
  )
}
