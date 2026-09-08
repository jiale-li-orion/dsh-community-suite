/** Package-owned invariant companion. @module @deepseek-ai/dsh-tool-workbench/invariant */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-tool-workbench'

/** Cordis companion plugin name. */
export const name = 'tool-workbench-invariant'
/** Services required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: every tool registration is an effect owned by the tools
 * registry, and each call commits through the workbench service, whose own
 * companion checks the emitted view against the committed state.
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
