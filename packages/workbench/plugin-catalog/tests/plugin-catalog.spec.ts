/**
 * The plugin catalog contract: the vocabulary a provider implements, the coded
 * failure every provider raises, and the Context key the provider publishes.
 */
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import type { PluginCatalog } from '../src/index.ts'
import { PluginCatalogError } from '../src/index.ts'
import type { PluginCatalogEntry } from '../src/types.ts'
import * as PluginCatalogInvariant from '../src/invariant.ts'

const ENTRY: PluginCatalogEntry = {
  name: 'dsh-example',
  owner: 'example',
  url: 'https://github.com/example/dsh-example',
  category: 'tools',
  description: 'An example plugin.',
  npm: null,
  version: null,
  stars: 3,
  downloads: null,
  install: 'dsh plugin --profile web add github:example/dsh-example',
  added: '2026-09-01',
}

describe('PluginCatalog contract', () => {
  it('is publishable under the Context key and serves entries and pages', async () => {
    const ctx = new Context()
    const provider: PluginCatalog = {
      search: () => Promise.resolve({ total: 1, entries: [ENTRY] }),
      get: url => Promise.resolve(url === ENTRY.url ? ENTRY : undefined),
    }
    ctx.provide('pluginCatalog', provider)
    expect((await ctx.pluginCatalog.search({ query: 'example' })).entries).toEqual([ENTRY])
    expect(await ctx.pluginCatalog.get(ENTRY.url)).toEqual(ENTRY)
    expect(await ctx.pluginCatalog.get('https://github.com/other/plugin')).toBeUndefined()
  })

  it('names a failure with a stable code and the original cause', () => {
    const cause = new Error('socket closed')
    const error = new PluginCatalogError('index unavailable', 'PLUGIN_CATALOG_UNAVAILABLE', { cause })
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('PluginCatalogError')
    expect(error.code).toBe('PLUGIN_CATALOG_UNAVAILABLE')
    expect(error.cause).toBe(cause)
  })
})

describe('plugin-catalog invariant companion', () => {
  it('declares its companion identity and explained empty invariant', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    const fiber = ctx.plugin(PluginCatalogInvariant)
    await fiber.await()
    expect(PluginCatalogInvariant.name).toBe('plugin-catalog-invariant')
    expect(PluginCatalogInvariant.inject).toEqual(['invariants'])
    await fiber.dispose()
  })
})
