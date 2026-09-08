# @deepseek-ai/dsh-plugin-catalog-tools

English | [中文](README.zh.md)

The model-facing plugin catalog tools. `plugin_search` reads the configured catalog and returns each entry's identity, one-line summary, popularity, and the catalog's own install command; `plugin_install` resolves one entry by the URL a search returned, validates the entry's install target, asks `ctx.approval` for the decision, and only then runs `dsh plugin --profile <profile> add <target>` through the subprocess seam as an argv array. The catalog's command text is never executed: only its target is taken, and only after `parseInstallTarget` accepts it (npm specifier or `github:owner/repo[#subpath]`, no parent-directory segment, no shell metacharacter). The profile comes from this build's own module path — an install never trusts a profile named by the index.

## Model Experience

### Tool schemas

#### What the model sees

The generated [`plugin_search` and `plugin_install` schemas](../../../docs/tool-catalog.md#deepseek-aidsh-plugin-catalog-tools) while this tool set is visible.

#### Token effect

Fixed schema cost on each request where the tools are visible.

#### KV Cache effect

Prefix-stable while tool definitions and visibility are unchanged. Registration lifecycle or scoped restrictions may invalidate reuse from the first changed schema token.

### Results and notices

#### What the model sees

`plugin_search` returns `No catalog entries matched.` or `N catalog entries matched.` plus one Markdown block per entry (name, owner, summary, URL, category, stars, install command); a truncated page says how many of the total it shows. `plugin_install` returns `Installed <name> into profile "<profile>". Restart the process to load it.` with the child's output when it was not empty.

#### Token effect

Results remain in parent history until compaction. A page is bounded by `limit` (default 10, capped at 50); install output is capped at 32 KiB.

#### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

## Known Limitations and Deferred Work

- **Restart required** — a plugin installed into the running profile is not mounted until the process restarts; the tool says so but cannot reload the composition.
- **No uninstall** — removing a plugin is a separate operation the catalog does not describe, so it is deferred rather than guessed.
- **Search is substring only** — the published index has no server-side query, so matching is client-side over the loaded entries; no ranking beyond catalog order.
