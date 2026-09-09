/**
 * The `awesome-dsh-plugin` index provider: one HTTP fetch of the published
 * CC0 `plugins.json`, validated once into the catalog vocabulary and cached in
 * memory behind a TTL, with an `If-None-Match` revalidation so a refresh costs
 * a 304. The index is data, not a dependency: a deployment that never mounts
 * this row simply has no catalog.
 * @module @deepseek-ai/dsh-plugin-catalog-awesome
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { PluginCatalog } from '@deepseek-ai/dsh-plugin-catalog'
import { PluginCatalogError } from '@deepseek-ai/dsh-plugin-catalog'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { PluginCatalogEntry, PluginCatalogPage, PluginCatalogQuery } from '@deepseek-ai/dsh-plugin-catalog'

/** The published index the provider reads by default. */
export const DEFAULT_INDEX_URL = 'https://awesome-dsh-plugin.com/plugins.json'

/** Default entries per page when a query names no limit. */
export const DEFAULT_LIMIT = 10

/** Hard ceiling on entries per page, whatever a query asks for. */
export const MAX_LIMIT = 50

/** Default index freshness window. */
export const DEFAULT_TTL_MS = 600_000

/** Default response-size cap. */
export const DEFAULT_MAX_BYTES = 8 * 1024 * 1024

/** Default per-request timeout. */
export const DEFAULT_TIMEOUT_MS = 15_000

/** Provider config: where the index lives and how it is cached. */
export interface Config {
  /** Index URL serving the generated `plugins.json`. */
  url?: string
  /** How long a loaded index stays fresh before an `If-None-Match` revalidation. */
  ttlMs?: number
  /** Maximum accepted response size in bytes. */
  maxBytes?: number
  /** Per-request timeout in milliseconds. */
  timeoutMs?: number
}

export const Config: z<Config> = z.object({
  url: z.string().default(DEFAULT_INDEX_URL),
  ttlMs: z.natural().min(1).default(DEFAULT_TTL_MS),
  maxBytes: z.natural().min(1).default(DEFAULT_MAX_BYTES),
  timeoutMs: z.natural().min(1).default(DEFAULT_TIMEOUT_MS),
})

/** One loaded index: the mapped entries and the validators a refresh needs. */
interface IndexCache {
  readonly entries: readonly PluginCatalogEntry[]
  readonly etag: string | undefined
  readonly at: number
}

/** One JSON object with unknown members, as read from the wire. */
type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Read one required string member, failing loud when the index drifts. */
function requiredString(source: JsonRecord, key: string): string {
  const value = source[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new PluginCatalogError(`plugin catalog entry field "${key}" is not a non-empty string`, 'PLUGIN_CATALOG_MALFORMED')
  }
  return value
}

/** Read one nullable number member; `null` and absent both mean "unknown". */
function nullableNumber(source: JsonRecord, key: string): number | null {
  const value = source[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Read one nullable string member. */
function nullableString(source: JsonRecord, key: string): string | null {
  const value = source[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** Map one index entry into the catalog vocabulary. */
function readEntry(value: unknown): PluginCatalogEntry {
  if (!isRecord(value)) {
    throw new PluginCatalogError('plugin catalog entry is not an object', 'PLUGIN_CATALOG_MALFORMED')
  }
  const description = value.description
  if (!isRecord(description)) {
    throw new PluginCatalogError('plugin catalog entry has no description object', 'PLUGIN_CATALOG_MALFORMED')
  }
  const descriptionZh = nullableString(description, 'zh')
  return {
    name: requiredString(value, 'name'),
    owner: requiredString(value, 'owner'),
    url: requiredString(value, 'url'),
    category: requiredString(value, 'category'),
    description: requiredString(description, 'en'),
    ...descriptionZh === null ? {} : { descriptionZh },
    npm: nullableString(value, 'npm'),
    version: nullableString(value, 'version'),
    stars: nullableNumber(value, 'stars'),
    downloads: nullableNumber(value, 'downloads'),
    install: requiredString(value, 'install'),
    added: requiredString(value, 'added'),
  }
}

/** Map the whole index payload, failing loud on any structural drift. */
function readIndex(payload: unknown): readonly PluginCatalogEntry[] {
  if (!isRecord(payload) || !Array.isArray(payload.plugins)) {
    throw new PluginCatalogError('plugin catalog payload has no plugins array', 'PLUGIN_CATALOG_MALFORMED')
  }
  return payload.plugins.map(readEntry)
}

/**
 * Read a response body, refusing one larger than the configured cap.
 * @param response - the fetched response.
 * @param maxBytes - maximum accepted body size.
 * @returns the body text.
 */
async function readCapped(response: Response, maxBytes: number): Promise<string> {
  const declared = response.headers.get('content-length')
  if (declared !== null && Number(declared) > maxBytes) {
    throw new PluginCatalogError(`plugin catalog body declares ${declared} bytes, over the ${String(maxBytes)}-byte cap`, 'PLUGIN_CATALOG_TOO_LARGE')
  }
  const reader = response.body?.getReader()
  if (reader === undefined) return ''
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new PluginCatalogError(`plugin catalog body exceeded the ${String(maxBytes)}-byte cap`, 'PLUGIN_CATALOG_TOO_LARGE')
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** Whether one entry matches a lowercase substring needle. */
function matches(entry: PluginCatalogEntry, needle: string): boolean {
  return entry.name.toLowerCase().includes(needle)
    || entry.owner.toLowerCase().includes(needle)
    || entry.description.toLowerCase().includes(needle)
    || (entry.descriptionZh?.toLowerCase().includes(needle) ?? false)
}

/**
 * The `awesome-dsh-plugin` provider. One in-memory index, one in-flight fetch
 * shared by concurrent callers, and a TTL that turns a refresh into a
 * conditional request.
 */
export class AwesomePluginCatalog extends TypertRemoteService implements PluginCatalog {
  static Config: z<Config> = Config

  private cache: IndexCache | undefined
  private inflight: Promise<readonly PluginCatalogEntry[]> | undefined
  private readonly url: string
  private readonly ttlMs: number
  private readonly maxBytes: number
  private readonly timeoutMs: number

  /**
   * @param ctx - owning Cordis context.
   * @param config - index URL and cache bounds (schema defaults applied; a
   *   hand-built context that omits them gets the same defaults).
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'pluginCatalog')
    this.url = config.url ?? DEFAULT_INDEX_URL
    this.ttlMs = config.ttlMs ?? DEFAULT_TTL_MS
    this.maxBytes = config.maxBytes ?? DEFAULT_MAX_BYTES
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  /**
   * Search the loaded index.
   * @param query - substring, exact category, and page size.
   * @param signal - optional caller cancellation, checked around the load.
   * @returns matching entries in catalog order plus the pre-limit total.
   */
  @Remote('search')
  async search(query: PluginCatalogQuery, signal?: AbortSignal): Promise<PluginCatalogPage> {
    signal?.throwIfAborted()
    const entries = await this.load()
    signal?.throwIfAborted()
    const needle = query.query?.trim().toLowerCase()
    const matched = entries.filter(entry =>
      (query.category === undefined || entry.category === query.category)
      && (needle === undefined || needle === '' || matches(entry, needle)))
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT)
    return { total: matched.length, entries: matched.slice(0, Math.max(0, limit)) }
  }

  /**
   * Resolve one entry by its canonical URL.
   * @param url - the entry URL a search returned.
   * @param signal - optional caller cancellation, checked around the load.
   * @returns the entry, or undefined when the index has none.
   */
  @Remote('get')
  async get(url: string, signal?: AbortSignal): Promise<PluginCatalogEntry | undefined> {
    signal?.throwIfAborted()
    const entries = await this.load()
    signal?.throwIfAborted()
    return entries.find(entry => entry.url === url)
  }

  /** Return the cached index, revalidating once the TTL has passed. */
  private async load(): Promise<readonly PluginCatalogEntry[]> {
    const cache = this.cache
    if (cache !== undefined && Date.now() - cache.at < this.ttlMs) return cache.entries
    this.inflight ??= this.fetchIndex().finally(() => { this.inflight = undefined })
    return this.inflight
  }

  /** Fetch, validate, and cache the index; a 304 refreshes the cache in place. */
  private async fetchIndex(): Promise<readonly PluginCatalogEntry[]> {
    const url = this.url
    let response: Response
    try {
      response = await fetch(url, {
        headers: {
          'accept': 'application/json',
          ...this.cache?.etag === undefined ? {} : { 'if-none-match': this.cache.etag },
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (error) {
      throw new PluginCatalogError(`plugin catalog ${url} could not be fetched`, 'PLUGIN_CATALOG_UNAVAILABLE', { cause: error })
    }
    const cache = this.cache
    if (response.status === 304) {
      if (cache === undefined) {
        throw new PluginCatalogError(`plugin catalog ${url} answered 304 without a cached index`, 'PLUGIN_CATALOG_UNAVAILABLE')
      }
      this.cache = { ...cache, at: Date.now() }
      return cache.entries
    }
    if (!response.ok) {
      throw new PluginCatalogError(`plugin catalog ${url} answered HTTP ${String(response.status)}`, 'PLUGIN_CATALOG_UNAVAILABLE')
    }
    const body = await readCapped(response, this.maxBytes)
    let payload: unknown
    try {
      payload = JSON.parse(body)
    } catch (error) {
      throw new PluginCatalogError(`plugin catalog ${url} is not valid JSON`, 'PLUGIN_CATALOG_MALFORMED', { cause: error })
    }
    const entries = readIndex(payload)
    const etag = response.headers.get('etag')
    this.cache = { entries, etag: etag ?? undefined, at: Date.now() }
    return entries
  }
}

export default AwesomePluginCatalog
