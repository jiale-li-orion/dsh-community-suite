/** Package-owned invariant companion for Session Context model tools. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-tool-session-context'

export const name = 'tool-session-context-invariant'
export const inject = ['invariants']

/** No runtime invariant: tool execution delegates every read and mutation to the owning service. */
const install: InvariantInstaller = () => {}

/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
