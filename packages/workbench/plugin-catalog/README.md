# @deepseek-ai/dsh-plugin-catalog

English | [中文](README.zh.md)

The plugin catalog capability. The Service Definition owns the vocabulary — one entry (identity, summary, popularity, and the index's own install command) and one page — so a consumer never learns where the data came from; a provider owns the index transport, validation, and caching. `search({ query, category, limit })` filters the loaded index and `get(url)` resolves the exact entry a search returned, which is what makes an install target impossible to invent.

## Model Experience

None, as this package defines the capability only; the model-facing tools live in `dsh-plugin-catalog-tools`.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **One provider at a time** — the abstract service is provided once, so a deployment chooses exactly one index; a second source would need a registry like `web`'s.
- **No write side** — the capability reads a published index; publishing, rating, or curating entries is out of scope.
