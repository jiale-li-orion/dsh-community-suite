/**
 * Plugin catalog vocabulary: one entry from a published plugin index, the
 * query a consumer searches with, and the page it gets back. The vocabulary is
 * deliberately the subset a model needs to choose a plugin — identity,
 * summary, popularity, and the index's own install command — never the index's
 * internal fields.
 * @module @deepseek-ai/dsh-plugin-catalog/types
 */

/** One plugin entry from a published catalog index. */
export interface PluginCatalogEntry {
  /** Bare plugin name, without the owner. */
  name: string
  /** Repository owner (a GitHub account or organization). */
  owner: string
  /** Canonical repository URL; the entry's identity for {@link PluginCatalog.get}. */
  url: string
  /** Category id from the index's closed vocabulary. */
  category: string
  /** One-line English summary. */
  description: string
  /** One-line Chinese summary when the index carries one. */
  descriptionZh?: string
  /** npm package name, or null when the plugin is not published to npm. */
  npm: string | null
  /** npm latest version, or null when unknown. */
  version: string | null
  /** Stars the index last observed, or null when unknown (never 0 for unknown). */
  stars: number | null
  /** Downloads the index last observed, or null when unknown. */
  downloads: number | null
  /** The index's prebuilt install command, passed through verbatim. */
  install: string
  /** Date the index first saw the entry, `YYYY-MM-DD`. */
  added: string
}

/** One catalog search. */
export interface PluginCatalogQuery {
  /** Case-insensitive substring matched against name, owner, and both summaries. */
  query?: string
  /** Exact category id from the index's vocabulary. */
  category?: string
  /** Maximum entries to return; a provider clamps it to its own ceiling. */
  limit?: number
}

/** One page of catalog results. */
export interface PluginCatalogPage {
  /** Matching entries before `limit` was applied. */
  total: number
  /** The matching entries in catalog order, at most `limit`. */
  entries: readonly PluginCatalogEntry[]
}
