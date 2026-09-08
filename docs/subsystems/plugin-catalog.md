# Plugin catalog

English | [中文](plugin-catalog.zh.md)

`@deepseek-ai/dsh-plugin-catalog` is the capability, not a data source: it owns the entry and query vocabulary (`PluginCatalogEntry`, `PluginCatalogQuery`, `PluginCatalogPage`) and the abstract `ctx.pluginCatalog` service whose `search({ query, category, limit })` filters a loaded index and whose `get(url)` resolves the exact entry a search returned. `@deepseek-ai/dsh-plugin-catalog-awesome` is the provider: one fetch of the published CC0 [`awesome-dsh-plugin`](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) index, validated once into that vocabulary and cached behind a TTL with an `If-None-Match` revalidation. `@deepseek-ai/dsh-plugin-catalog-tools` is the consumer: `plugin_search` reads the catalog, and `plugin_install` resolves an entry by URL, validates the entry's own install target, and runs it only after an approval grant.

## Discovery

The provider never serves a partial index. A non-2xx answer, an unreachable host, a body over `maxBytes`, invalid JSON, a missing `plugins` array, or an entry missing a required field each fail loud with a coded `PluginCatalogError`, so a consumer either sees a complete page or an error. `stars` and `downloads` are nullable on purpose: the index reports `null` for "not published or not observed", and the tools omit the field rather than printing a zero.

## Install

An install is an approval-gated operation, never a route. `plugin_install` takes only the URL a search result carried, resolves that entry through the provider, and hands the entry's own `install` command to `parseInstallTarget`, which accepts only `dsh plugin [--profile <name>] add <target>` and only an npm specifier or a `github:owner/repo[#subpath]` target — no parent-directory segment, no shell metacharacter. The command text is never executed and no command is synthesized from entry fields; the profile comes from this build's own module path, so the index cannot name the profile an install writes to. The decision goes through `ctx.approval`, and the accepted argv runs through the subprocess seam as an array. The installed plugin is not mounted until the process restarts, and the tool says so.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxplugincatalog--plugincatalog-abstract-seam"></a>

### `ctx.pluginCatalog` — `PluginCatalog` (abstract seam)

Abstract plugin catalog provider. A provider owns one index's transport and validation; consumers see only entries and pages, and `get(url)` resolves the exact entry a search returned so an install never invents a target.

```ts cordis-catalog
/**
 * Search the catalog.
 * @param query - the filter and page size.
 * @param signal - optional caller cancellation.
 * @returns matching entries in catalog order plus the pre-limit total.
 */
abstract search(query: PluginCatalogQuery, signal?: AbortSignal): Promise<PluginCatalogPage>

/**
 * Resolve one entry by its canonical URL.
 * @param url - the entry URL a search returned.
 * @param signal - optional caller cancellation.
 * @returns the entry, or undefined when the index has none.
 */
abstract get(url: string, signal?: AbortSignal): Promise<PluginCatalogEntry | undefined>
```

Source: [`packages/workbench/plugin-catalog/src/index.ts:44`](../../packages/workbench/plugin-catalog/src/index.ts)
<!-- END GENERATED cordis-surface -->
