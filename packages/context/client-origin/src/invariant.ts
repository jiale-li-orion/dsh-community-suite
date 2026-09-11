/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-origin`.
 * @module @deepseek-ai/dsh-client-origin/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-origin'

/** Cordis companion plugin name. */
export const name = 'client-origin-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the plugin derives a per-turn statement from the durable
 * user messages of the turn it is preparing and keeps no state of its own, so
 * there is no live-service relation to assert at runtime. The derivation and the
 * text it renders are pinned by the package's unit tests and by the
 * real-composition test that drives the mounted plugin.
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
