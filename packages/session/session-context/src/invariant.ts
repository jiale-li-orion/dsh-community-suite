/** Runtime invariants for Session Context replacements. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import type {} from './types.ts'

const PACKAGE_NAME = '@deepseek-ai/dsh-session-context'

export const name = 'session-context-invariant'
export const inject = ['invariants']

const install: InvariantInstaller = (ctx, fail) => {
  ctx.on('session/event', (session, event) => {
    if (event.type !== 'context/rewrite') return
    const replacement = session.readLog().at(event.data.replacementSeq)
    if (replacement?.type !== 'user/message'
      || replacement.data.source.kind !== 'plugin'
      || replacement.data.source.plugin !== 'session-context') {
      fail('context/rewrite must cite one session-context user/message replacement')
      return
    }
    const surfaceOp = replacement.surfaceOp
    if (surfaceOp === undefined || surfaceOp === 'append') {
      fail('context/rewrite must cite one session-context user/message replacement')
      return
    }
    if (surfaceOp.start !== event.data.shadowedRange.start
      || surfaceOp.end !== event.data.shadowedRange.end) {
      fail('context/rewrite range must match its replacement user/message')
    }
  }, { global: true })
}

/** Register the Session Context invariant companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
