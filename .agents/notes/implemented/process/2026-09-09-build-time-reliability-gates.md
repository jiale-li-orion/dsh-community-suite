# Agent Note: Two build-time gates for plugin-load failures

Status: implemented

English | [中文](2026-09-09-build-time-reliability-gates.zh.md)

## Problem

Two defects in the marketplace work reached a running deployment and looked identical to the operator: the plugin page showed "Failed to load plugins" while the server kept serving. Neither failed the build, the type check, or any unit test.

1. Generated Remote code imported `zod`, but `plugin-catalog-awesome` and `plugin-install` did not declare it. The bundler left `require("zod")` external, and the browser module table has only three sources — platform seed words, shell statics, and registered plugin bundles — so the bundle could never load. Restarting the process did not help, because the failure is in the browser.
2. `@Remote('install')` collided with `install` on `RemoteNamespaceService.prototype`. The gateway rejects such a descriptor when it mounts the namespace, so the row contributed nothing and its panel lost its Remote face.

The common property is that both are decidable from built artifacts and source, with no running server and no browser.

## Decision

**A build step executes every client bundle's registration envelope and checks its external requires.** `pnpm run verify-client-bundles` (wired into `pnpm run build` between the library and web builds) discovers each package that declares `./client`, reads its emitted `lib/client.js`, runs the top-level `window.__ModuleLoader__.load({ id, factory })` call in `node:vm` without invoking the factory, and asserts that the bundle registers exactly once under its package name and that every literal `require("<specifier>")` names a module-table word. Undeclared dependencies left external fail here, before anyone restarts a deployment. The seed words are read textually from `packages/client/web/src/platform.ts`, because the host face may not import client project files.

**The Typert analyzer rejects a Remote name that the namespace service answers itself.** `@deepseek-ai/dsh-typert-protocol` exports `REMOTE_RESERVED_NAMES`; the Client gateway uses it for its mount-time check, and the analyzer fails generation for both an explicit `@Remote('name')` and a bare method whose own name is reserved, with a diagnostic that suggests the suffix rename (`install` → `installPlugin`).

**The same step checks every declared graph edge.** Each `dsh.client.inject` entry must name a registered client bundle or a platform seed module. An edge naming a host-only package is inert metadata today, but it claims a row the client graph will never have, and the package that actually provides the service is what the entry should name.

The existing [purity gate](../architecture/2026-07-23-client-plugin-loading-model.md) judges a plugin's *source* imports against the platform list at build time; this step judges the *emitted* envelope against the runtime table, so a dependency the bundler externalizes without any source-level violation is still caught.

**The analyzer keeps its own copy of that list.** `tsdown.config.ts` loads the generator from its previously built `lib/types/tsdown-plugin.js`, which resolves workspace imports through built `lib/` artifacts. A build-time import of a constant the same build introduces therefore deadlocks: the artifact that must export it is the artifact being produced. The copy is guarded by an equality test in `packages/typert/generator/tests/remote-model.spec.ts`, which resolves both sides through tsconfig `paths` to source and fails when they diverge.

## Alternatives considered

- **Rely on restarting and looking at the page.** Rejected: it needs a human, a browser, and a restart per defect, and both defects survived exactly that.
- **Add a unit test for the two bundles that broke.** Rejected: it pins the two known cases and misses the next package that omits a dependency of generated code.
- **Resolve externals in a bundler configuration check.** Rejected: the module table lives in the browser shell, so only the shell's own words decide whether a specifier resolves; a bundler-side allowlist would be a second, drifting source of truth.
- **Import `REMOTE_RESERVED_NAMES` in the analyzer.** Rejected: the build cannot bootstrap the export it is introducing (see above).
- **Derive the reserved names from the built namespace service at generation time.** Rejected: it makes generation depend on runtime artifacts and would still fail on the first build that adds a member.

## Consequences

`pnpm run build` now fails on a client bundle that cannot load, and Typert generation fails on a reserved Remote name, so both classes of defect are caught before a deployment restart. The cost is one more build step over 41 bundles and a duplicated eleven-name list with a drift test. The gate also fixes the shape of the contract: a client bundle's dependencies must be declared, inlined, or already present in the module table.

## Testing

`scripts/verify-client-bundles.spec.ts` drives the checker with synthetic bundles and proves five rejection paths: an unknown external, a graph edge naming no row, a wrong registration id, a throwing envelope, and a bundle that registers nothing. `packages/typert/generator/tests/remote-model.spec.ts` covers an explicit reserved name, a bare reserved method name, and the list equality. `pnpm run build:lib:host` is the integration proof that the generator no longer imports a workspace artifact.
