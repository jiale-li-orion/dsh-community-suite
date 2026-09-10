// @vitest-environment jsdom
/**
 * Markdown and source preview: which file each entry claims, which grammar the
 * source entry highlights with, and what the shared read produces in each of
 * its three states.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { CodeViewer, codeTypeSelector } from '../src/client/CodeViewer.tsx'
import type { CodeViewerProps } from '../src/client/CodeViewer.tsx'
import { MarkdownViewer, markdownTypeSelector } from '../src/client/MarkdownViewer.tsx'
import { PdfViewer, pdfTypeSelector } from '../src/client/PdfViewer.tsx'
import type { PdfViewerProps } from '../src/client/PdfViewer.tsx'
import type { MarkdownViewerProps } from '../src/client/MarkdownViewer.tsx'
import { isMarkdownFile, languageForFile } from '../src/client/preview-language.ts'
import type { WorkbenchViewerOwnerProps } from '../src/client/contract/slots.ts'
import { zh } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const t = makeTranslate(zh)

/** One dispatched file, as the chain hands it to an entry. */
function owner(name: string, mediaType = 'text/plain; charset=utf-8'): WorkbenchViewerOwnerProps {
  return { name, path: `/w/${name}`, url: `/workbench/file?path=/w/${name}`, mediaType }
}

/** Stub `fetch` with one response body. */
function stubFetch(body: string, init?: { ok?: boolean; status?: number }): void {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    text: () => Promise.resolve(body),
  } as Response)))
}

describe('preview selection', () => {
  it('claims Markdown documents by extension and by media type', () => {
    expect(isMarkdownFile('README.md', 'text/plain; charset=utf-8')).toBe(true)
    expect(isMarkdownFile('notes.MARKDOWN', 'text/plain')).toBe(true)
    expect(isMarkdownFile('doc.mdx', 'text/plain')).toBe(true)
    expect(isMarkdownFile('doc', 'text/markdown; charset=utf-8')).toBe(true)
    expect(isMarkdownFile('main.ts', 'text/plain')).toBe(false)
    expect(markdownTypeSelector(owner('README.md'))).toBe('text/plain; charset=utf-8')
    expect(markdownTypeSelector(owner('main.ts'))).toBeNull()
  })

  it('maps extensions and bare file names onto highlighting grammars', () => {
    expect(languageForFile('a.ts')).toBe('typescript')
    expect(languageForFile('a.TSX')).toBe('tsx')
    expect(languageForFile('worker.py')).toBe('python')
    expect(languageForFile('values.yml')).toBe('yaml')
    expect(languageForFile('Dockerfile')).toBe('dockerfile')
    expect(languageForFile('Makefile')).toBe('makefile')
    expect(languageForFile('notes.txt')).toBeUndefined()
    expect(languageForFile('noextension')).toBeUndefined()
  })

  it('claims PDFs and frames them with a way out for hosts without a viewer', () => {
    expect(pdfTypeSelector(owner('doc.pdf', 'application/pdf'))).toBe('application/pdf')
    expect(pdfTypeSelector(owner('doc', 'application/pdf'))).toBe('application/pdf')
    expect(pdfTypeSelector(owner('doc.txt'))).toBeNull()

    const props = { ...owner('doc.pdf', 'application/pdf'), matched: 'application/pdf', t } as unknown as PdfViewerProps
    const { container } = render(<PdfViewer {...props} />)
    const frame = container.querySelector('iframe')
    expect(frame?.getAttribute('src')).toBe('/workbench/file?path=/w/doc.pdf')
    // A platform with no inline PDF viewer still has the file one click away.
    const fallback = screen.getByRole('link')
    expect(fallback.getAttribute('href')).toBe('/workbench/file?path=/w/doc.pdf')
    expect(fallback.getAttribute('download')).toBe('doc.pdf')
  })

  it('declines files it cannot highlight so the text entry takes them', () => {
    expect(codeTypeSelector(owner('a.ts'))).toBe('text/plain; charset=utf-8')
    expect(codeTypeSelector(owner('a.json'))).toBe('text/plain; charset=utf-8')
    expect(codeTypeSelector(owner('a.txt'))).toBeNull()
    expect(codeTypeSelector(owner('a.png', 'image/png'))).toBeNull()
  })
})

describe('MarkdownViewer', () => {
  it('renders the document rather than its source', async () => {
    stubFetch('# Title\n\nBody **bold** text.\n')
    const props = { ...owner('README.md'), matched: 'text/plain', t } as unknown as MarkdownViewerProps
    render(<MarkdownViewer {...props} />)
    expect(screen.getByText(zh['viewer.loading'])).toBeTruthy()
    await waitFor(() => { expect(screen.getByText('Title')).toBeTruthy() })
    // The source markers are gone: the heading is an element, not a literal '# '.
    expect(screen.queryByText('# Title')).toBeNull()
    expect(screen.getByText('bold')).toBeTruthy()
  })

  it('reports a failed read instead of an empty document', async () => {
    stubFetch('', { ok: false, status: 404 })
    const props = { ...owner('README.md'), matched: 'text/plain', t } as unknown as MarkdownViewerProps
    render(<MarkdownViewer {...props} />)
    await waitFor(() => { expect(screen.getByText(/HTTP 404/)).toBeTruthy() })
  })
})

describe('CodeViewer', () => {
  it('shows the file with its grammar and offers a copy control', async () => {
    stubFetch('const answer = 42\n')
    const props = { ...owner('a.ts'), matched: 'text/plain', t } as unknown as CodeViewerProps
    const { container } = render(<CodeViewer {...props} />)
    // The highlighter emits a span tree, so the file reads off the container
    // rather than off one text node.
    await waitFor(() => { expect(container.textContent).toContain('const answer = 42') })
    expect(screen.getByText(zh['viewer.copy'])).toBeTruthy()
  })

  it('reports a failed read instead of an empty file', async () => {
    stubFetch('', { ok: false, status: 500 })
    const props = { ...owner('a.ts'), matched: 'text/plain', t } as unknown as CodeViewerProps
    render(<CodeViewer {...props} />)
    await waitFor(() => { expect(screen.getByText(/HTTP 500/)).toBeTruthy() })
  })
})
