// @vitest-environment jsdom
/**
 * MarketplacePanel presentation behavior: search, the result rows, the
 * two-step install confirm, and every failure surface. Props are fed directly
 * as the composed shares.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { PluginCatalogEntry, PluginCatalogPage } from '@deepseek-ai/dsh-plugin-catalog/types'
import type { PluginInstallResult } from '@deepseek-ai/dsh-plugin-install/types'
import { MarketplacePanel } from '../src/client/MarketplacePanel.tsx'
import type { MarketplacePanelProps } from '../src/client/MarketplacePanel.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(() => { cleanup() })

const t = makeTranslate(zh)

const ENTRY: PluginCatalogEntry = {
  name: 'dsh-example',
  owner: 'example',
  url: 'https://github.com/example/dsh-example',
  category: 'tools',
  description: 'An example plugin.',
  descriptionZh: '一个示例插件。',
  npm: 'dsh-example',
  version: '1.0.0',
  stars: 12,
  downloads: 34,
  install: 'dsh plugin --profile web add github:example/dsh-example',
  added: '2026-09-01',
}

/**
 * Build the composed props over injected catalog faces.
 * @param search - the injected search.
 * @param install - the injected install.
 * @param active - the active locale the bound hook reports.
 * @returns composed props.
 */
function props(
  search: MarketplacePanelProps['search'] = vi.fn(() => Promise.resolve({ total: 1, entries: [ENTRY] })),
  install: MarketplacePanelProps['install'] = vi.fn(() => Promise.resolve({
    name: ENTRY.name,
    target: 'github:example/dsh-example',
    profile: 'web',
    output: '',
  })),
  active = 'zh',
): MarketplacePanelProps {
  return {
    width: 560,
    search,
    install,
    useLocale: (read: (snapshot: { active: string }) => unknown) => read({ active }),
    t,
  } as unknown as MarketplacePanelProps
}

describe('MarketplacePanel', () => {
  it('opens on the catalog default page and shows the search box and the notice', async () => {
    const search = vi.fn(() => Promise.resolve({ total: 1, entries: [ENTRY] }))
    render(<MarketplacePanel {...props(search as MarketplacePanelProps['search'])} />)
    expect(screen.getByLabelText(zh['marketplace.search'])).toBeTruthy()
    expect(screen.getByText(zh['marketplace.notice'])).toBeTruthy()
    // No query typed: the panel still asks for the most popular plugins.
    await waitFor(() => { expect(search).toHaveBeenCalledWith({ query: undefined, limit: 20 }) })
    expect(await screen.findByText('dsh-example')).toBeTruthy()
  })

  it('shows the Chinese summary under zh and the English one under en', async () => {
    const { unmount } = render(<MarketplacePanel {...props()} />)
    expect(await screen.findByText('一个示例插件。')).toBeTruthy()
    unmount()

    const { descriptionZh: _omitted, ...entryWithoutChinese } = ENTRY
    const noChinese: PluginCatalogEntry = entryWithoutChinese
    const search = vi.fn(() => Promise.resolve({ total: 1, entries: [noChinese] }))
    render(<MarketplacePanel {...props(search as MarketplacePanelProps['search'], undefined, 'en')} />)
    expect(await screen.findByText('An example plugin.')).toBeTruthy()
    expect(screen.queryByText('一个示例插件。')).toBeNull()
  })

  it('falls back to the English summary when the index carries no Chinese one', async () => {
    const { descriptionZh: _dropped, ...entryWithoutChinese } = ENTRY
    const search = vi.fn(() => Promise.resolve({ total: 1, entries: [entryWithoutChinese] }))
    render(<MarketplacePanel {...props(search as MarketplacePanelProps['search'])} />)
    expect(await screen.findByText('An example plugin.')).toBeTruthy()
  })

  it('searches with the typed query and renders one row per entry', async () => {
    const search = vi.fn(() => Promise.resolve({ total: 1, entries: [ENTRY] }))
    render(<MarketplacePanel {...props(search as MarketplacePanelProps['search'])} />)
    fireEvent.change(screen.getByLabelText(zh['marketplace.search']), { target: { value: 'example' } })
    fireEvent.submit(screen.getByLabelText(zh['marketplace.search']).closest('form')!)
    expect(await screen.findByText('dsh-example')).toBeTruthy()
    expect(search).toHaveBeenLastCalledWith({ query: 'example', limit: 20 })
    expect(screen.getByText('(example)')).toBeTruthy()
    expect(screen.getByText('tools · 12★ · 34 downloads')).toBeTruthy()
    expect(screen.getByText(ENTRY.install)).toBeTruthy()
  })

  it('omits unknown popularity and an empty query from the request', async () => {
    const bare: PluginCatalogEntry = { ...ENTRY, stars: null, downloads: null }
    const search = vi.fn(() => Promise.resolve({ total: 1, entries: [bare] }))
    render(<MarketplacePanel {...props(search as MarketplacePanelProps['search'])} />)
    fireEvent.submit(screen.getByLabelText(zh['marketplace.search']).closest('form')!)
    expect(await screen.findByText('tools')).toBeTruthy()
    expect(search).toHaveBeenLastCalledWith({ query: undefined, limit: 20 })
  })

  it('reports an empty page and a failed search', async () => {
    const empty = vi.fn(() => Promise.resolve({ total: 0, entries: [] } satisfies PluginCatalogPage))
    const { unmount } = render(<MarketplacePanel {...props(empty as MarketplacePanelProps['search'])} />)
    fireEvent.submit(screen.getByLabelText(zh['marketplace.search']).closest('form')!)
    expect(await screen.findByText(zh['marketplace.empty'])).toBeTruthy()
    unmount()

    const failing = vi.fn(() => Promise.reject(new Error('catalog unreachable')))
    render(<MarketplacePanel {...props(failing as MarketplacePanelProps['search'])} />)
    fireEvent.submit(screen.getByLabelText(zh['marketplace.search']).closest('form')!)
    expect(await screen.findByText(/catalog unreachable/)).toBeTruthy()
  })

  it('confirms before installing, then reports the installed profile', async () => {
    const install = vi.fn(() => Promise.resolve({
      name: ENTRY.name,
      target: 'github:example/dsh-example',
      profile: 'web',
      output: '',
    } satisfies PluginInstallResult))
    render(<MarketplacePanel {...props(undefined, install as MarketplacePanelProps['install'])} />)
    fireEvent.submit(screen.getByLabelText(zh['marketplace.search']).closest('form')!)
    const button = await screen.findByRole('button', { name: zh['marketplace.install'] })
    fireEvent.click(button)
    // First click only arms the confirm: nothing runs yet.
    expect(install).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: zh['marketplace.confirm'] }))
    await waitFor(() => { expect(install).toHaveBeenCalledWith(ENTRY.url) })
    expect(await screen.findByText(/已安装 dsh-example 到 profile "web"/)).toBeTruthy()
  })

  it('surfaces an install failure and clears the pending state', async () => {
    const install = vi.fn(() => Promise.reject(new Error('exit code 1')))
    render(<MarketplacePanel {...props(undefined, install as MarketplacePanelProps['install'])} />)
    fireEvent.submit(screen.getByLabelText(zh['marketplace.search']).closest('form')!)
    fireEvent.click(await screen.findByRole('button', { name: zh['marketplace.install'] }))
    fireEvent.click(screen.getByRole('button', { name: zh['marketplace.confirm'] }))
    expect(await screen.findByText(/exit code 1/)).toBeTruthy()
    expect(screen.getByRole('button', { name: zh['marketplace.install'] }).hasAttribute('disabled')).toBe(false)
  })

  it('stringifies a non-Error rejection from either face', async () => {
    // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- the non-Error rejection is the scenario under test.
    const search = vi.fn(() => Promise.reject('plain failure'))
    const { unmount } = render(<MarketplacePanel {...props(search as MarketplacePanelProps['search'])} />)
    fireEvent.submit(screen.getByLabelText(zh['marketplace.search']).closest('form')!)
    expect(await screen.findByText(/plain failure/)).toBeTruthy()
    unmount()

    // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- the non-Error rejection is the scenario under test.
    const install = vi.fn(() => Promise.reject('install exploded'))
    render(<MarketplacePanel {...props(undefined, install as MarketplacePanelProps['install'])} />)
    fireEvent.submit(screen.getByLabelText(zh['marketplace.search']).closest('form')!)
    fireEvent.click(await screen.findByRole('button', { name: zh['marketplace.install'] }))
    fireEvent.click(screen.getByRole('button', { name: zh['marketplace.confirm'] }))
    expect(await screen.findByText(/install exploded/)).toBeTruthy()
  })
})
