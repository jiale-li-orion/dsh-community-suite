/** Package-owned invariant companion. @module @deepseek-ai/dsh-plugin-catalog-tools/invariant */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-plugin-catalog-tools'

/** Cordis companion plugin name. */
export const name = 'tool-plugin-catalog-invariant'
/** Services required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: every contribution is a tool registration owned by the
 * tools registry, and an install's durable record is the approval pair the
 * approval service already logs. The target validator is pinned by its own
 * matrix test.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registrations disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
