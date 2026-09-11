// @vitest-environment jsdom
/**
 * The composer's upload control: every picked file is handed to the workspace and
 * named in the draft, and a failure says so instead of pretending.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { createUploadEntry } from '../src/client/UploadButton.tsx'
import type { UploadButtonProps, UploadInjected } from '../src/client/UploadButton.tsx'
import { zh } from '../src/client/locales.ts'

const t = makeTranslate(zh)
const SESSION = 'session-upload' as const

afterEach(() => { cleanup() })

/** Compose the seat props with one upload action. */
function props(
  upload: UploadInjected['upload'],
  draft = '',
): { props: UploadButtonProps & { upload: UploadInjected['upload'] }; setDraft: ReturnType<typeof vi.fn> } {
  const setDraft = vi.fn()
  const composed = {
    session: { sessionId: SESSION as unknown as UploadButtonProps['session']['sessionId'] },
    input: { draft },
    inputActions: { setDraft },
    t,
    upload,
  } as unknown as UploadButtonProps & { upload: typeof upload }
  return { props: composed, setDraft }
}

/** Render the entry with a bound upload action and return its hidden input. */
function pickerWith(built: ReturnType<typeof props>) {
  const Entry = createUploadEntry(built.props.upload)
  const { container } = render(<Entry {...built.props} />)
  return container.querySelector('input[type="file"]') as HTMLInputElement
}

describe('composer upload control', () => {
  it('offers a labelled control that opens the platform chooser', () => {
    const built = props(() => Promise.resolve('uploads/x.png'))
    const picker = pickerWith(built)
    const button = screen.getByRole('button', { name: zh['upload.pick'] })
    const opened = vi.spyOn(picker, 'click')
    fireEvent.click(button)
    expect(opened).toHaveBeenCalledTimes(1)
    // Several files at once: a phone gallery hands over more than one.
    expect(picker.multiple).toBe(true)
  })

  it('names every uploaded file in the draft', async () => {
    const upload = vi.fn()
      .mockResolvedValueOnce('uploads/a.png')
      .mockResolvedValueOnce('uploads/b.pdf')
    const built = props(upload)
    const picker = pickerWith(built)
    const files = [new File(['a'], 'a.png'), new File(['b'], 'b.pdf')]
    fireEvent.change(picker, { target: { files } })
    await waitFor(() => { expect(built.setDraft).toHaveBeenCalledTimes(1) })
    expect(upload).toHaveBeenCalledTimes(2)
    expect(built.setDraft).toHaveBeenCalledWith(
      `${zh['upload.reference'].replace('{path}', 'uploads/a.png')}\n${zh['upload.reference'].replace('{path}', 'uploads/b.pdf')}`,
    )
  })

  it('keeps what the person typed and adds the reference on its own line', async () => {
    const built = props(() => Promise.resolve('uploads/c.png'), '看看这个 ')
    const picker = pickerWith(built)
    fireEvent.change(picker, { target: { files: [new File(['c'], 'c.png')] } })
    await waitFor(() => { expect(built.setDraft).toHaveBeenCalledTimes(1) })
    expect(built.setDraft).toHaveBeenCalledWith(`看看这个\n${zh['upload.reference'].replace('{path}', 'uploads/c.png')}`)
  })

  it('reports a failure instead of a reference', async () => {
    const built = props(() => Promise.reject(new Error('body exceeds 1024 bytes')))
    const picker = pickerWith(built)
    fireEvent.change(picker, { target: { files: [new File(['d'], 'd.png')] } })
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      zh['upload.failed'].replace('{reason}', 'body exceeds 1024 bytes'),
    )
    expect(built.setDraft).not.toHaveBeenCalled()
  })

  it('does nothing when the chooser is dismissed', () => {
    const upload = vi.fn()
    const built = props(upload)
    const picker = pickerWith(built)
    fireEvent.change(picker, { target: { files: [] } })
    // A cancelled dialog reports no list at all.
    fireEvent.change(picker, { target: { files: null } })
    expect(upload).not.toHaveBeenCalled()
    expect(built.setDraft).not.toHaveBeenCalled()
  })

  it('reports a rejection that is not an Error', async () => {
    // eslint-disable-next-line prefer-promise-reject-errors -- the reason a non-Error throw carries is what must reach the person.
    const built = props(() => Promise.reject('offline'))
    const picker = pickerWith(built)
    fireEvent.change(picker, { target: { files: [new File(['e'], 'e.png')] } })
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      zh['upload.failed'].replace('{reason}', 'offline'),
    )
  })
})
