# @deepseek-ai/dsh-plugin-catalog-awesome

English | [中文](README.zh.md)

The catalog provider over the published [`awesome-dsh-plugin`](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) index (CC0). One HTTP fetch of the generated `plugins.json`, validated once into the catalog vocabulary and cached in memory behind a TTL; after the TTL a refresh is a conditional request, so an unchanged index costs a `304`. A malformed payload, a drifted entry, an oversized body, a non-2xx answer, or an unreachable host each fail loud with a coded `PluginCatalogError` instead of serving a partial index.

## Model Experience

None, as this package only loads an index; the model-facing tools live in `dsh-plugin-catalog-tools`.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **One index per provider** — the URL is config, and the cache holds one payload; a second index needs a second row (and the capability accepts one provider).
- **Fetches from the public site by default** — an air-gapped deployment sets `url` to a mirror or an npm-installed copy of the same JSON; there is no bundled snapshot.
- **Entries are trusted as data, not vetted** — the index states plainly that listing is not a security review, and `stars`/`downloads` may be stale; `null` means unknown, never zero.
