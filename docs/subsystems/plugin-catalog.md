# Plugin catalog

English | [中文](plugin-catalog.zh.md)

`@deepseek-ai/dsh-plugin-catalog` is the capability, not a data source: it owns the entry and query vocabulary (`PluginCatalogEntry`, `PluginCatalogQuery`, `PluginCatalogPage`) and the abstract `ctx.pluginCatalog` service whose `search({ query, category, limit })` filters a loaded index and whose `get(url)` resolves the exact entry a search returned. `@deepseek-ai/dsh-plugin-catalog-awesome` is the provider: one fetch of the published CC0 [`awesome-dsh-plugin`](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) index, validated once into that vocabulary and cached behind a TTL with an `If-None-Match` revalidation. `@deepseek-ai/dsh-plugin-catalog-tools` is the consumer: `plugin_search` reads the catalog, and `plugin_install` resolves an entry by URL, validates the entry's own install target, and runs it only after an approval grant.

## Discovery

The provider never serves a partial index. A non-2xx answer, an unreachable host, a body over `maxBytes`, invalid JSON, a missing `plugins` array, or an entry missing a required field each fail loud with a coded `PluginCatalogError`, so a consumer either sees a complete page or an error. `stars` and `downloads` are nullable on purpose: the index reports `null` for "not published or not observed", and the tools omit the field rather than printing a zero.

## Install

One implementation serves both planes. `@deepseek-ai/dsh-plugin-install` publishes `ctx.pluginInstall.install(url)`: it resolves the entry the URL names, hands the entry's own `install` command to `parseInstallTarget` — which accepts only `dsh plugin [--profile <name>] add <target>` and only an npm specifier or a `github:owner/repo[#subpath]` target, no parent-directory segment and no shell metacharacter — derives the profile from this build's own module path, and runs the accepted argv through the subprocess seam as an array. The command text is never executed and no command is synthesized from entry fields; the index cannot name the profile an install writes to.

The agent path adds `ctx.approval`: `plugin_install` takes only the URL a search result carried, resolves the entry, asks for the decision, and calls the capability only on `allowed-once`. The installed plugin is not mounted until the process restarts, and both callers say so.

## The marketplace panel

The workbench's `marketplace` panel is the human path to the same capability: it searches the catalog through the provider's Remote surface and calls `pluginInstall.installPlugin` after a two-step confirm, so the click is the operator's own gesture rather than an agent request. It never receives a command — the entry's install string stays on the host — and the `/api` browser trust fence still bounds who may reach the endpoint.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxplugincatalog--plugincatalog"></a>

### `ctx.pluginCatalog` — `PluginCatalog`

The plugin catalog contract. A provider owns one index's transport and validation; consumers see only entries and pages, and `get(url)` resolves the exact entry a search returned so an install never invents a target. The provider publishes the service under the `pluginCatalog` key (the Context augmentation below); this package owns only the contract and its vocabulary.

```ts cordis-catalog
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
```

Source: [`packages/workbench/plugin-catalog/src/index.ts:44`](../../packages/workbench/plugin-catalog/src/index.ts)

<a id="ctxplugininstall--plugininstallservice"></a>

### `ctx.pluginInstall` — `PluginInstallService`

The install service. `install(url)` is the only entry: the URL names a catalog entry, the entry names its own install command, and this service decides whether that command's target may run and which profile it targets.

```ts cordis-catalog
/**
 * Install one catalog plugin.
 * @param url - the exact entry URL a catalog search returned.
 * @param signal - optional caller cancellation.
 * @returns the completed install's target, profile, and child output.
 * @throws PluginInstallError when the entry is unknown, the target is refused, or the installer fails.
 */
@Remote('installPlugin') async install(url: string, signal?: AbortSignal): Promise<PluginInstallResult>
```

Source: [`packages/workbench/plugin-install/src/index.ts:69`](../../packages/workbench/plugin-install/src/index.ts)
<!-- END GENERATED cordis-surface -->
