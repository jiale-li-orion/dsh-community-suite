/**
 * Client-origin context: eligible steps tell the model which kind of client sent
 * the turn's prompt, so an answer can be written for the screen in hand.
 *
 * The class is read from the durable user message rather than from the transport,
 * so what the model is told is exactly what the log can replay.
 *
 * @module @deepseek-ai/dsh-client-origin
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { deriveClientOriginContext, renderClientOriginContext } from './origin.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'client-origin'

/** The agent registry that owns pre-step processing. */
export const inject = ['agents']

/**
 * Collect the user messages already entered in the turn being prepared,
 * followed by the ones this step proposes.
 * @param agent - the agent whose session log holds the turn.
 * @param turn - the turn being prepared.
 * @param proposed - messages the step has already decided to send.
 * @returns the turn's user messages in order.
 */
function turnMessages(agent: Agent, turn: number, proposed: readonly UserMessage[]): UserMessage[] {
  const log = agent.session.readLog()
  let start: number | undefined
  for (const event of log.reverseValuesOf(['turn/start'])) {
    if (event.data.turn === turn) {
      start = event.seq
      break
    }
  }
  const entered: UserMessage[] = []
  if (start !== undefined) {
    for (const event of log.valuesOf(['user/message'], start + 1)) entered.push(event.data)
  }
  return [...entered, ...proposed]
}

/**
 * Register the pre-step injection. The class is stated once per turn, at the
 * step that opens it: it cannot change while the turn it belongs to is open, and
 * repeating it every step would spend context on a fact that has not moved.
 * @param ctx - the plugin context.
 */
export function apply(ctx: Context): void {
  ctx.on('agent/pre-step', async (
    { agent, turn, step, signal },
    next,
  ): Promise<PreStepDecision> => {
    const decision = await next()
    if (decision.kind === 'reject' || signal.aborted || step !== 1) return decision
    const origin = deriveClientOriginContext(turnMessages(agent, turn, decision.messages))
    if (origin.kind === 'missing') return decision
    const text = renderClientOriginContext(origin)
    return {
      kind: 'enter',
      messages: [
        ...decision.messages,
        createUserMessage({
          content: [{ type: 'text', text }],
          source: { kind: 'plugin', plugin: name, form: 'snapshot', sections: [{ name, text }] },
        }),
      ],
    }
  }, { prepend: true })
}
