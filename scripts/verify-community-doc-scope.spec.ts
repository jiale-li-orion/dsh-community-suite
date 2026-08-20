/** Regression coverage for Markdown gates that must include community docs. */

import { describe, expect, it } from 'vitest'
import { MARKDOWN_LINK_PATTERNS } from './verify-md-links.ts'
import { MARKDOWN_WRAP_PATTERNS } from './verify-md-wrap.ts'

describe('community Markdown scope', () => {
  it('includes community Markdown in both link and wrap checks', () => {
    expect(MARKDOWN_LINK_PATTERNS).toContain('community/**/*.md')
    expect(MARKDOWN_WRAP_PATTERNS).toContain('community/**/*.md')
  })
})
