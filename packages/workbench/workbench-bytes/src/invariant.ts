/** Package-owned invariant companion. @module @deepseek-ai/dsh-workbench-bytes/invariant */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-workbench-bytes'

/** Cordis companion plugin name. */
export const name = 'workbench-bytes-invariant'
/** Services required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this package owns one route registration, which is an
 * effect of the webserver registry, and it holds no state to check against an
 * event stream. Its two fences are enforced per request and pinned by the
 * route tests, which drive real sockets.
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
