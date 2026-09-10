/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-connection-status`.
 * @module @deepseek-ai/dsh-client-ui-connection-status/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-connection-status'

/** Cordis companion plugin name. */
export const name = 'client-ui-connection-status-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this package renders the connection plugin's published
 * phase into one `shell.overlay` entry and owns no data of its own. It emits no
 * cordis events and keeps no cross-plugin mutable state; its single slot
 * registration proves disposal through the HMR-safety spec.
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
