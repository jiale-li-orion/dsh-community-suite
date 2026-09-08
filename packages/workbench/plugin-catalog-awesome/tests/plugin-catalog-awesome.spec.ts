/**
 * The awesome-index provider over a real HTTP server: validation, the search
 * surface, TTL caching, `If-None-Match` revalidation, and every refusal path.
 */
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { PluginCatalogError } from '@deepseek-ai/dsh-plugin-catalog'
import AwesomePluginCatalog, { DEFAULT_LIMIT, MAX_LIMIT } from '../src/index.ts'
import * as ProviderInvariant from '../src/invariant.ts'

/** One index entry as the published JSON carries it. */
const ENTRY = {
  name: 'dsh-example',
  owner: 'example',
  url: 'https://github.com/example/dsh-example',
  category: 'tools',
  description: { en: 'An example plugin.', zh: '一个示例插件。' },
  npm: 'dsh-example',
  version: '1.2.3',
  stars: 12,
  downloads: null,
  install: 'dsh plugin --profile web add dsh-example',
  added: '2026-09-01',
}

/** The published payload shape. */
function indexPayload(plugins: readonly unknown[] = [ENTRY]): unknown {
  return { name: 'awesome-dsh-plugin', count: plugins.length, plugins }
}

interface ServerState {
  /** Requests received, so a test can assert cache behavior. */
  readonly requests: IncomingMessage[]
  /** The body the next response carries (or the current one). */
  body: string
  /** The status the next response carries. */
  status: number
  /** The ETag the server advertises. */
  etag: string
}

const servers: ReturnType<typeof createServer>[] = []
const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve) => {
    server.closeAllConnections()
    server.close(() => { resolve() })
  })))
})

/**
 * Serve one index over a real socket.
 * @param body - the response body.
 * @param etag - the ETag the server advertises.
 * @returns the index URL and the recorded state.
 */
async function serveIndex(body = JSON.stringify(indexPayload()), etag = '"v1"'): Promise<{ url: string; state: ServerState }> {
  const state: ServerState = { requests: [], body, status: 200, etag }
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    state.requests.push(req)
    if (state.status === 304 || req.headers['if-none-match'] === state.etag) {
      res.writeHead(304, { etag: state.etag })
      res.end()
      return
    }
    res.writeHead(state.status, { 'content-type': 'application/json', 'etag': state.etag })
    res.end(state.body)
  })
  servers.push(server)
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  const { port } = server.address() as AddressInfo
  return { url: `http://127.0.0.1:${String(port)}/plugins.json`, state }
}

/**
 * Mount the provider over one server.
 * @param url - index URL.
 * @param ttlMs - cache lifetime.
 * @returns the mounted catalog.
 */
async function mount(url: string, ttlMs = 60_000): Promise<AwesomePluginCatalog> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(AwesomePluginCatalog, { url, ttlMs })
  return ctx.pluginCatalog as AwesomePluginCatalog
}

describe('AwesomePluginCatalog', () => {
  it('loads the index and searches by substring, category, and page size', async () => {
    const second = { ...ENTRY, name: 'dsh-other', owner: 'other', url: 'https://github.com/other/dsh-other', category: 'theme', description: { en: 'A theme.', zh: '一个主题。' } }
    const { url } = await serveIndex(JSON.stringify(indexPayload([ENTRY, second])))
    const catalog = await mount(url)

    const all = await catalog.search({})
    expect(all.total).toBe(2)
    expect(all.entries[0]).toMatchObject({
      name: 'dsh-example',
      owner: 'example',
      category: 'tools',
      description: 'An example plugin.',
      descriptionZh: '一个示例插件。',
      npm: 'dsh-example',
      version: '1.2.3',
      stars: 12,
      downloads: null,
    })

    // A Chinese summary is searchable, so a Chinese query finds the plugin.
    expect((await catalog.search({ query: '示例' })).entries.map(entry => entry.name)).toEqual(['dsh-example'])
    expect((await catalog.search({ query: 'OTHER' })).entries.map(entry => entry.name)).toEqual(['dsh-other'])
    expect((await catalog.search({ category: 'theme' })).entries.map(entry => entry.name)).toEqual(['dsh-other'])
    expect((await catalog.search({ query: 'example', category: 'theme' })).total).toBe(0)
    expect((await catalog.search({ query: '   ' })).total).toBe(2)
    expect((await catalog.search({ limit: 1 })).entries).toHaveLength(1)
    expect((await catalog.search({ limit: -3 })).entries).toHaveLength(0)
    expect((await catalog.search({ limit: MAX_LIMIT + 100 })).entries).toHaveLength(2)
    expect(DEFAULT_LIMIT).toBe(10)
  })

  it('omits an absent Chinese summary and keeps unknown popularity as null', async () => {
    const bare = { ...ENTRY, name: 'dsh-bare', url: 'https://github.com/example/dsh-bare', description: { en: 'Bare.' }, npm: null, version: null, stars: null, downloads: null }
    const { url } = await serveIndex(JSON.stringify(indexPayload([bare])))
    const catalog = await mount(url)
    const [entry] = (await catalog.search({})).entries
    expect(entry).toEqual({
      name: 'dsh-bare',
      owner: 'example',
      url: 'https://github.com/example/dsh-bare',
      category: 'tools',
      description: 'Bare.',
      npm: null,
      version: null,
      stars: null,
      downloads: null,
      install: ENTRY.install,
      added: '2026-09-01',
    })
    // A needle matching nothing walks every field of the matcher, including the
    // absent Chinese summary.
    expect((await catalog.search({ query: 'zzz' })).total).toBe(0)
  })

  it('resolves an entry by URL and reports an unknown URL as absent', async () => {
    const { url } = await serveIndex()
    const catalog = await mount(url)
    expect(await catalog.get(ENTRY.url)).toMatchObject({ name: 'dsh-example' })
    expect(await catalog.get('https://github.com/nobody/nothing')).toBeUndefined()
  })

  it('serves a cached index inside the TTL and revalidates with If-None-Match after it', async () => {
    const { url, state } = await serveIndex()
    const catalog = await mount(url, 60_000)
    await catalog.search({})
    await catalog.search({})
    expect(state.requests).toHaveLength(1)

    // A zero-TTL mount forces the revalidation path on the next read.
    const fresh = await mount(url, 1)
    await fresh.search({})
    await new Promise(resolve => setTimeout(resolve, 5))
    expect((await fresh.search({})).total).toBe(1)
    expect(state.requests.some(request => request.headers['if-none-match'] === state.etag)).toBe(true)
  })

  it('shares one in-flight fetch between concurrent callers', async () => {
    const { url, state } = await serveIndex()
    const catalog = await mount(url)
    await Promise.all([catalog.search({}), catalog.search({}), catalog.get(ENTRY.url)])
    expect(state.requests).toHaveLength(1)
  })

  it('refuses a non-2xx answer, malformed JSON, and a drifted entry', async () => {
    const { url, state } = await serveIndex()
    const catalog = await mount(url)
    state.status = 500
    await expect(catalog.search({})).rejects.toMatchObject({ code: 'PLUGIN_CATALOG_UNAVAILABLE' })
    state.status = 200
    state.body = 'not json'
    state.etag = '"v2"'
    await expect(catalog.search({})).rejects.toMatchObject({ code: 'PLUGIN_CATALOG_MALFORMED' })
    state.body = JSON.stringify({ name: 'no-plugins' })
    state.etag = '"v3"'
    await expect(catalog.search({})).rejects.toMatchObject({ code: 'PLUGIN_CATALOG_MALFORMED' })
    state.body = JSON.stringify(indexPayload(['not an object']))
    state.etag = '"v4"'
    await expect(catalog.search({})).rejects.toMatchObject({ code: 'PLUGIN_CATALOG_MALFORMED' })
    state.body = JSON.stringify(indexPayload([{ ...ENTRY, install: undefined }]))
    state.etag = '"v5"'
    await expect(catalog.search({})).rejects.toMatchObject({ code: 'PLUGIN_CATALOG_MALFORMED' })
    state.body = JSON.stringify(indexPayload([{ ...ENTRY, description: 'flat' }]))
    state.etag = '"v6"'
    await expect(catalog.search({})).rejects.toMatchObject({ code: 'PLUGIN_CATALOG_MALFORMED' })
    state.body = JSON.stringify(indexPayload([{ ...ENTRY, description: { zh: '没有英文' } }]))
    state.etag = '"v7"'
    await expect(catalog.search({})).rejects.toMatchObject({ code: 'PLUGIN_CATALOG_MALFORMED' })
  })

  it('refuses a body over the configured cap', async () => {
    const { url } = await serveIndex()
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(AwesomePluginCatalog, { url, maxBytes: 16 })
    await expect(ctx.pluginCatalog.search({})).rejects.toMatchObject({ code: 'PLUGIN_CATALOG_TOO_LARGE' })
  })

  it('refuses a chunked body over the cap and a response with no body at all', async () => {
    const chunked = createServer((_req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.write('x'.repeat(64))
      res.end()
    })
    servers.push(chunked)
    await new Promise<void>((resolve) => { chunked.listen(0, '127.0.0.1', resolve) })
    const { port } = chunked.address() as AddressInfo
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(AwesomePluginCatalog, { url: `http://127.0.0.1:${String(port)}/plugins.json`, maxBytes: 8 })
    await expect(ctx.pluginCatalog.search({})).rejects.toMatchObject({ code: 'PLUGIN_CATALOG_TOO_LARGE' })

    // A declared length over the cap is refused before the body is read.
    const declared = createServer((_req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(200, { 'content-type': 'application/json', 'content-length': '64' })
      res.end('x'.repeat(64))
    })
    servers.push(declared)
    await new Promise<void>((resolve) => { declared.listen(0, '127.0.0.1', resolve) })
    const declaredPort = (declared.address() as AddressInfo).port
    const declaredCtx = new Context()
    contexts.push(declaredCtx)
    await declaredCtx.plugin(AwesomePluginCatalog, { url: `http://127.0.0.1:${String(declaredPort)}/plugins.json`, maxBytes: 8 })
    await expect(declaredCtx.pluginCatalog.search({})).rejects.toMatchObject({ code: 'PLUGIN_CATALOG_TOO_LARGE' })

    const empty = createServer((_req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(204)
      res.end()
    })
    servers.push(empty)
    await new Promise<void>((resolve) => { empty.listen(0, '127.0.0.1', resolve) })
    const emptyPort = (empty.address() as AddressInfo).port
    const emptyCtx = new Context()
    contexts.push(emptyCtx)
    await emptyCtx.plugin(AwesomePluginCatalog, { url: `http://127.0.0.1:${String(emptyPort)}/plugins.json` })
    await expect(emptyCtx.pluginCatalog.search({})).rejects.toMatchObject({ code: 'PLUGIN_CATALOG_MALFORMED' })
  })

  it('defaults every bound when the deployment configures nothing but a URL', async () => {
    const { url, state } = await serveIndex()
    const ctx = new Context()
    contexts.push(ctx)
    // Cordis applies the schema, so the plugin path always passes a resolved
    // config; the constructor's own defaults cover a hand-built instance.
    const handBuilt = new AwesomePluginCatalog(ctx, {})
    expect(handBuilt).toBeInstanceOf(AwesomePluginCatalog)

    const configured = await mount(url)
    state.etag = ''
    await expect(configured.search({})).resolves.toMatchObject({ total: 1 })
  })

  it('caches an index whose response carried no ETag', async () => {
    const server = createServer((_req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(indexPayload()))
    })
    servers.push(server)
    await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
    const { port } = server.address() as AddressInfo
    const catalog = await mount(`http://127.0.0.1:${String(port)}/plugins.json`)
    expect((await catalog.search({})).total).toBe(1)
    expect((await catalog.search({})).total).toBe(1)
  })

  it('reports an unreachable index as unavailable', async () => {
    const catalog = await mount('http://127.0.0.1:1/plugins.json')
    await expect(catalog.search({})).rejects.toMatchObject({ code: 'PLUGIN_CATALOG_UNAVAILABLE' })
  })

  it('refuses a 304 that arrives without a cached index', async () => {
    const { url, state } = await serveIndex()
    state.status = 304
    const catalog = await mount(url)
    await expect(catalog.search({})).rejects.toMatchObject({ code: 'PLUGIN_CATALOG_UNAVAILABLE' })
  })

  it('honors an already-aborted caller signal', async () => {
    const { url } = await serveIndex()
    const catalog = await mount(url)
    const controller = new AbortController()
    controller.abort()
    await expect(catalog.search({}, controller.signal)).rejects.toThrow()
    await expect(catalog.get(ENTRY.url, controller.signal)).rejects.toThrow()
  })

  it('names its failures with the catalog error type', async () => {
    const { url } = await serveIndex()
    const catalog = await mount(url)
    await expect(catalog.get(ENTRY.url)).resolves.toBeDefined()
    expect(new PluginCatalogError('x', 'CODE').name).toBe('PluginCatalogError')
  })
})

describe('plugin-catalog-awesome invariant companion', () => {
  it('declares its companion identity and explained empty invariant', () => {
    expect(ProviderInvariant.name).toBe('plugin-catalog-awesome-invariant')
    expect(ProviderInvariant.inject).toEqual(['invariants'])
  })
})
