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

**The Typert analyzer rejects a Remote name that the namespace service answers itself.** The Client gateway already refuses such a descriptor when the namespace mounts, against that service's own prototype and instance members. The analyzer now fails generation for both an explicit `@Remote('name')` and a bare method whose own name is reserved, with a diagnostic that suggests the suffix rename (`install` → `installPlugin`).

**The same step checks every declared graph edge.** Each `dsh.client.inject` entry must name a registered client bundle or a platform seed module. An edge naming a host-only package is inert metadata today, but it claims a row the client graph will never have, and the package that actually provides the service is what the entry should name.

The existing [purity gate](../architecture/2026-07-23-client-plugin-loading-model.md) judges a plugin's *source* imports against the platform list at build time; this step judges the *emitted* envelope against the runtime table, so a dependency the bundler externalizes without any source-level violation is still caught.

**The analyzer owns a static list of those names.** It cannot read the runtime authority: the generator is host-face and `packages/api/gateway/src/client/index.ts` is a client-face module, and a client bundle may not carry a value import of another plugin's module anyway — the [purity gate](../architecture/2026-07-23-client-plugin-loading-model.md) rejects it. A build-time import of a workspace artifact is also unavailable to the generator, which `tsdown.config.ts` loads from its previously built `lib/types/tsdown-plugin.js`. The two `remote-model.spec.ts` fixtures pin both rejection forms against that list, and the gateway remains the runtime authority at mount.

## Alternatives considered

- **Rely on restarting and looking at the page.** Rejected: it needs a human, a browser, and a restart per defect, and both defects survived exactly that.
- **Add a unit test for the two bundles that broke.** Rejected: it pins the two known cases and misses the next package that omits a dependency of generated code.
- **Resolve externals in a bundler configuration check.** Rejected: the module table lives in the browser shell, so only the shell's own words decide whether a specifier resolves; a bundler-side allowlist would be a second, drifting source of truth.
- **Publish the reserved names from a shared package and import them in both the gateway and the analyzer.** Rejected: the analyzer cannot import the client namespace service, and a client bundle may not value-import another plugin's module, so the shared constant would either duplicate the authority or need a purity-gate exemption for a package whose classes do carry runtime identity.
- **Derive the reserved names from the built namespace service at generation time.** Rejected: it makes generation depend on runtime artifacts and would still fail on the first build that adds a member.

## Consequences

`pnpm run build` now fails on a client bundle that cannot load, and Typert generation fails on a reserved Remote name, so both classes of defect are caught before a deployment restart. The cost is one more build step over 41 bundles and an eleven-name list the analyzer maintains next to the gateway's runtime check. The gate also fixes the shape of the contract: a client bundle's dependencies must be declared, inlined, or already present in the module table.

## Testing

`scripts/verify-client-bundles.spec.ts` drives the checker with synthetic bundles and proves five rejection paths: an unknown external, a graph edge naming no row, a wrong registration id, a throwing envelope, and a bundle that registers nothing. `packages/typert/generator/tests/remote-model.spec.ts` covers an explicit reserved name and a bare reserved method name. `pnpm run build:lib:host` is the integration proof that the generator no longer imports a workspace artifact.
