/**
 * The plugin catalog capability: the abstract provider publishes
 * `ctx.pluginCatalog`, and a concrete provider's two methods are the whole
 * consumer surface.
 */
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import PluginCatalog, { PluginCatalogError } from '../src/index.ts'
import type { PluginCatalogEntry, PluginCatalogPage, PluginCatalogQuery } from '../src/index.ts'
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

/** A provider that answers from a fixed list. */
class StubCatalog extends PluginCatalog {
  /**
   * @param ctx - owning context.
   * @param entries - the entries this stub serves.
   */
  constructor(ctx: Context, private readonly entries: readonly PluginCatalogEntry[]) {
    super(ctx)
  }

  /** @param query - ignored by the stub. @returns the fixed page. */
  search(query: PluginCatalogQuery): Promise<PluginCatalogPage> {
    void query
    return Promise.resolve({ total: this.entries.length, entries: this.entries })
  }

  /** @param url - entry URL to resolve. @returns the matching entry. */
  get(url: string): Promise<PluginCatalogEntry | undefined> {
    return Promise.resolve(this.entries.find(entry => entry.url === url))
  }
}

describe('PluginCatalog', () => {
  it('publishes ctx.pluginCatalog from the concrete provider', async () => {
    const ctx = new Context()
    await ctx.plugin({ apply: (inner: Context) => { new StubCatalog(inner, [ENTRY]) } })
    expect(ctx.pluginCatalog).toBeInstanceOf(PluginCatalog)
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
