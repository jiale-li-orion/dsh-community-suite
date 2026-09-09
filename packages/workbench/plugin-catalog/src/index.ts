/**
 * The plugin catalog capability: a searchable, installable roster of published
 * DSH plugins. The Service Definition owns the query and entry vocabulary; a
 * provider owns the index transport, caching, and validation, so a consumer
 * (the catalog tools) never learns where the data came from.
 * @module @deepseek-ai/dsh-plugin-catalog
 */

import type { PluginCatalogEntry, PluginCatalogPage, PluginCatalogQuery } from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The configured plugin catalog provider. */
    pluginCatalog: PluginCatalog
  }
}

/** Refusal raised when a catalog index cannot be loaded or validated. */
export class PluginCatalogError extends Error {
  /** Stable diagnostic code for the failure. */
  readonly code: string

  /**
   * @param message - what failed, naming the index when known.
   * @param code - stable diagnostic code.
   * @param options - standard error options (cause).
   */
  constructor(message: string, code: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'PluginCatalogError'
    this.code = code
  }
}

/**
 * The plugin catalog contract. A provider owns one index's transport and
 * validation; consumers see only entries and pages, and `get(url)` resolves the
 * exact entry a search returned so an install never invents a target. The
 * provider publishes the service under the `pluginCatalog` key (the Context
 * augmentation below); this package owns only the contract and its vocabulary.
 */
export interface PluginCatalog {
  /**
   * Search the catalog.
   * @param query - the filter and page size.
   * @param signal - optional caller cancellation.
   * @returns matching entries in catalog order plus the pre-limit total.
   */
  search(query: PluginCatalogQuery, signal?: AbortSignal): Promise<PluginCatalogPage>

  /**
   * Resolve one entry by its canonical URL.
   * @param url - the entry URL a search returned.
   * @param signal - optional caller cancellation.
   * @returns the entry, or undefined when the index has none.
   */
  get(url: string, signal?: AbortSignal): Promise<PluginCatalogEntry | undefined>
}
