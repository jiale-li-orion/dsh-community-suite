# Agent Note: The marketplace panel is a second, human-owned caller of one install capability

Status: implemented

English | [中文](2026-09-09-plugin-marketplace-panel.zh.md)

## Problem

ADR-7 deliberately shipped the plugin catalog as **tools only** — "the index is data, so expose it as a tool/service, not a UI" — because the audited `dsh-plugins-store` reached its install by exact-path routes that bypass the rc.7 `/api` trust fence. That decision was right about the *route*, but it left a deployment whose user wants to browse and install a plugin without an agent in the loop with no visible surface at all: the only affordance was asking the model. The audited project's own UI shows the missing shape (search box, result rows, an install action per row), and its defect was the transport behind the button, not the button.

## Decision

The browser calls `ctx.remote.pluginInstall.installPlugin(url)`; the Host method remains `ctx.pluginInstall.install(url)`. The Remote name avoids the namespace service's internal `install` method. Both generated Remote providers declare `zod` as a runtime dependency so the client bundle can inline their codecs.

**Extract the install into one capability, then let two planes call it.** `@deepseek-ai/dsh-plugin-install` publishes `ctx.pluginInstall.install(url)`: it resolves the catalog entry the URL names, validates the entry's own target with `parseInstallTarget`, derives the profile from this build's module path, and runs `dsh plugin --profile <profile> add <target>` as an argv array. `@deepseek-ai/dsh-tool-plugin-catalog`'s `plugin_install` now resolves the entry, asks `ctx.approval`, and calls that capability; the new `marketplace` panel calls the same capability after a two-step confirm. The validator, the profile derivation, and the process path exist once, so the two callers cannot drift.

**The catalog gains a Remote surface; the index still has one reader.** `AwesomePluginCatalog` extends `TypertRemoteService` and marks `search`/`get` with `@Remote`, so the browser searches through the host cache instead of fetching the 3 MB index itself. `@deepseek-ai/dsh-plugin-catalog` stays the transport-free contract (the entry and page vocabulary, the coded error, the Context key).

**The human gesture is the consent; the agent path keeps `ctx.approval`.** A panel install is the operator clicking Install and then Confirm in their own browser, so it does not ask them to approve themselves. The `/api` browser trust fence still bounds who may reach the endpoint — the same fence the tool path relies on — which is what the rejected community route lacked.

**The panel never sees a command.** It receives entry metadata and sends back a URL; the entry's install string stays on the host, where the validator decides whether its target may run.

## Alternatives considered

- **Keep the catalog tools-only.** Rejected: the user asked for a visible marketplace, and "ask the model to install it" is not a marketplace. The ADR-7 objection was the unfenced route, which this design does not reintroduce.
- **Mount the audited marketplace UI.** Rejected: it is shaped for a different DSH version, and its install path is the exact defect ADR-7 recorded.
- **Let the panel run the install itself through a `webServer` route.** Rejected: that is the bespoke-route shape again, and it would duplicate the validator and the profile derivation.
- **Pass the catalog's install command to the client and POST it back.** Rejected: a command string crossing the wire is exactly what the tool path refuses; the client sends the URL and nothing else.
- **Give the panel its own approval prompt.** Rejected: asking a human to approve the button they just pressed is noise, not a control.

## Consequences

A deployment now has two entry points to one install capability: the agent's tool (approval-gated) and the marketplace panel (human gesture), both validating the same target and both reporting that a restart is required. The catalog provider gained a wire surface, so its cache now serves the browser too. The cost is one more host row (`plugin-install`) and one more client panel to keep covered; the panel cannot uninstall, which remains deliberately deferred.

## Testing

`packages/workbench/plugin-install/tests/plugin-install.spec.ts` drives the capability over a recording process seam: argv shape, the configured profile, signal forwarding, unknown URL, failing exit, a silent failure, a seam with no collected streams, and the missing-CLI-entry refusal, plus the target-validator matrix and profile derivation. `packages/workbench/tool-plugin-catalog/tests/tool-plugin-catalog.spec.ts` drives both tools through the real tools registry and approval service against a recording catalog and install capability. `packages/client/ui-workbench/tests/marketplace-panel.client.spec.tsx` covers search, rows, the two-step confirm, empty and failure states, and both non-Error rejections; `tests/browser-plugin.client.spec.ts` covers the panel registration and both Remote faces, including a failed Remote. `pnpm run test:gui` and the `DSH_SNAPSHOT=replay` web lane cover the assembled browser.
