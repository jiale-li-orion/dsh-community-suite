/** Package-owned invariant companion. @module @deepseek-ai/dsh-plugin-catalog-awesome/invariant */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-plugin-catalog-awesome'

/** Cordis companion plugin name. */
export const name = 'plugin-catalog-awesome-invariant'
/** Services required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the provider holds one in-memory index and emits no
 * events, so there is no owned relationship to assert. Its validation and
 * caching contracts are pinned by its own tests, which drive a real HTTP
 * server.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
