// @vitest-environment jsdom
/**
 * WorkbenchToggle presentation behavior: one header button that triggers the
 * injected column transition and carries no state of its own.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { WorkbenchBarAction, WorkbenchToggle } from '../src/client/WorkbenchToggle.tsx'
import type { WorkbenchBarActionProps, WorkbenchToggleProps } from '../src/client/WorkbenchToggle.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(() => { cleanup() })

const t = makeTranslate(zh)

describe('WorkbenchToggle', () => {
  it('renders the workbench title and toggles on click', () => {
    const toggle = vi.fn()
    render(<WorkbenchToggle {...{ toggle, t } as unknown as WorkbenchToggleProps} />)
    const button = screen.getByRole('button', { name: zh.title })
    expect(button.getAttribute('title')).toBe(zh['toggle.open'])
    fireEvent.click(button)
    expect(toggle).toHaveBeenCalledTimes(1)
  })

  it('renders the page-bar form as its own chip, because it has its own seat', () => {
    const toggle = vi.fn()
    const bar = { toggle, t } as unknown as WorkbenchBarActionProps
    const { container } = render(<WorkbenchBarAction {...bar} />)
    const button = screen.getByRole('button')
    expect(button.className).toContain('barAction')
    fireEvent.click(button)
    expect(toggle).toHaveBeenCalledTimes(1)
    expect(container.textContent).toBe(zh['title'])
  })
})
