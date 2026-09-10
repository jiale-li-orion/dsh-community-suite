/**
 * Read one previewed file's bytes as text. Three viewer entries differ only in
 * how they present that text, so the read lives here: one abort on unmount, one
 * failure message, one place where a malformed response is rejected.
 */
import { useEffect, useState } from 'react'

/** What one read produced: exactly one of the two is set once it settles. */
export interface FileText {
  /** The file's bytes decoded as text. */
  text?: string
  /** Transport or status failure, as a message a viewer can show. */
  error?: string
}

/**
 * Read a fenced file URL as text.
 * @param url - the same-origin byte route for the previewed file.
 * @returns the text, a failure message, or neither while the read is in flight.
 */
export function useFileText(url: string): FileText {
  const [state, setState] = useState<FileText>({})
  useEffect(() => {
    const abort = new AbortController()
    setState({})
    void fetch(url, { signal: abort.signal }).then(
      (response) => {
        if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
        return response.text()
      },
      (cause: unknown) => { throw cause instanceof Error ? cause : new Error(String(cause)) },
    ).then(
      (body) => { setState({ text: body }) },
      (cause: unknown) => {
        // An aborted read is this effect's own teardown, not a failure to show.
        if (abort.signal.aborted) return
        setState({ error: cause instanceof Error ? cause.message : String(cause) })
      },
    )
    return () => { abort.abort() }
  }, [url])
  return state
}
