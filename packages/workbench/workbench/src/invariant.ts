/** Package-owned invariant companion. @module @deepseek-ai/dsh-workbench/invariant */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-workbench'

/** Cordis companion plugin name. */
export const name = 'workbench-invariant'
/** Services required before the companion can reserve and check package ownership. */
export const inject = ['invariants']

/**
 * Every `workbench/changed` payload must be the state the service currently
 * holds: the event is the one projection both planes consume, so a commit that
 * emitted a stale or detached value would silently desynchronize them.
 */
const install: InvariantInstaller = Object.assign(
  (ctx: Context, fail: InvariantFailure) => {
    ctx.on('workbench/changed', (view) => {
      const current = ctx.workbench.state()
      if (current.open !== view.open || current.active !== view.active) {
        fail(`workbench/changed emitted ${JSON.stringify(view)} while the service holds ${JSON.stringify(current)}`)
      }
    })
  },
  { inject: ['workbench'] },
)

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
