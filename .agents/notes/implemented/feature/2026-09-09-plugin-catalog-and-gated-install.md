# Agent Note: Plugin discovery reads a published index, and install is an approved argv, never a route

Status: implemented

English | [中文](2026-09-09-plugin-catalog-and-gated-install.zh.md)

## Problem

The workbench can show files, but a deployment still cannot answer "which plugins exist?" or install one. The audited community projects both got this wrong in ways ADR-7 names concretely: `dsh-plugins-store` installs by shelling out to a native command from its own exact-path routes under `/api/dshmarketplace/*`, and an exact route wins over the `/api` prefix, so those handlers bypass the rc.7 trust fence entirely — any page the user visits could trigger an install (`notes/dsh-plugins-store.md:6-13`). Its history also records that a `tools/pre-execute` listener returning bare `undefined` short-circuited the built-in allow and broke every tool call in the session. Separately, `awesome-dsh-plugin` publishes a CC0 index of 3,408 entries that already carries a prebuilt `dsh plugin --profile web add <target>` command (`notes/awesome-dsh-plugin.md:3-5`), so reimplementing a catalog would mean owning a pipeline far heavier than the workbench should.

## Decision

**Discovery is a capability, not a data source.** `@deepseek-ai/dsh-plugin-catalog` owns the vocabulary (`PluginCatalogEntry`, `PluginCatalogQuery`, `PluginCatalogPage`) and the abstract `ctx.pluginCatalog` service with `search({ query, category, limit })` and `get(url)`. `@deepseek-ai/dsh-plugin-catalog-awesome` is the provider: one fetch of the published `plugins.json`, validated once into that vocabulary, cached in memory behind a TTL, and revalidated with `If-None-Match` so an unchanged index costs a `304`. A non-2xx answer, an unreachable host, a body over `maxBytes`, invalid JSON, a missing `plugins` array, or an entry missing a required field fails loud with a coded `PluginCatalogError`; the provider never serves a partial index.

**The index is data, so the model gets tools, not a page.** `@deepseek-ai/dsh-plugin-catalog-tools` registers `plugin_search` (returns identity, summary, popularity, and the catalog's own install command) and `plugin_install`. There is no route, no slot, and no mirror; the catalog is consumed through the capability seam like any other host service.

**Install is an approval-gated argv, never a command string.** `plugin_install` accepts only the URL a search result carried, resolves that entry through the provider, and passes the entry's own `install` text to `parseInstallTarget`, which accepts only `dsh plugin [--profile <name>] add <target>` and only an npm specifier or a `github:owner/repo[#subpath]` target — no `..`, no shell metacharacter. The command text is never executed and no command is synthesized from entry fields. The profile comes from this build's own module path (`$DSH_HOME/profiles/<name>/node_modules/…`), never from the index, and a source launch that cannot derive it fails loud and asks for the `profile` config key. The decision goes through `ctx.approval.request` with the agent, call id, reason, and signal, and only `allowed-once` proceeds; the accepted argv runs through `ctx.subprocess.spawn` as an array, so no shell parses it.

**`stars`/`downloads` stay nullable.** The index reports `null` for "not published or not observed", and the tools omit the field instead of printing a zero, which would read as measured popularity.

## Alternatives considered

- **Serve the catalog from a `webServer` route (the plugins-store shape).** Rejected: it is exactly the bypass ADR-7 recorded, and a browser page must never be able to install anything. The model-facing tool plus approval is the whole affordance.
- **Synthesize the install command from `npm`/`url` fields.** Rejected: the index already publishes a validated command, and synthesizing one would let two sources disagree about what runs. The tool takes only the target and runs its own argv.
- **Trust the profile named inside the index's command.** Rejected: a third-party string must not choose which profile a deployment writes to. The running build names its own profile.
- **Add a `tools/pre-execute` guard.** Rejected: approval already gates the operation that performs it, and the audited failure mode (a waterfall listener returning `undefined`) is a cost with no benefit here.
- **Ship a snapshot of the index.** Rejected: the index changes nightly and is 3 MB; a TTL cache plus a mirror-overridable URL is the smaller commitment.

## Consequences

A deployment gains discovery and an approvable install without a new route, and the model can find a plugin it does not know by name. The install is visible in the session log as the approval pair, so a human can audit every one. The cost is a network dependency for discovery (overridable with `url`), a restart before an installed plugin loads, and no uninstall path — deliberately deferred rather than guessed.

## Testing

`packages/workbench/plugin-catalog/tests/plugin-catalog.spec.ts` covers the abstract provider's published service and the coded error. `packages/workbench/plugin-catalog-awesome/tests/plugin-catalog-awesome.spec.ts` drives the provider through a real HTTP server: search by substring (including a Chinese summary), category, page size, `get` by URL, TTL caching, `If-None-Match` revalidation, a shared in-flight fetch, and every refusal (non-2xx, malformed JSON, drifted entries, a declared-length and a chunked oversize body, a bodiless 200, an unreachable host, a 304 without a cache, and an aborted caller). `packages/workbench/tool-plugin-catalog/tests/tool-plugin-catalog.spec.ts` drives both tools through the real tools registry and approval service against a recording catalog and process seam, and pins the target-validator matrix (accepted npm and `github:` shapes; refused foreign commands, traversal, metacharacters, and unknown forms) plus profile resolution. `pnpm run test:gui` and the `DSH_SNAPSHOT=replay` web lane cover the assembled browser, and `apps/web/tests/shipped-composition.e2e.ts` asserts the shipped catalog now lists both tools.
