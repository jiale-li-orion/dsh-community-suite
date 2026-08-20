/** Durable request-route lookup for one open model step. @module @deepseek-ai/dsh-llm-retry/history */

import type { SessionLogCut } from '@deepseek-ai/dsh-session'

/**
 * Find the provider in force for one currently open step.
 * Request headers remain effective across turn boundaries until a newer full
 * snapshot changes them; every provider change requires a newer full snapshot.
 * @param events - session events ending inside the open step.
 * @param turn - turn that owns the failed step.
 * @param step - failed step whose provider is required.
 * @param end - exclusive history end; defaults to the reader's captured length.
 * @returns the provider from the request header in force for the step.
 */
export function providerForOpenStep(
  events: SessionLogCut,
  turn: number,
  step: number,
  end = events.length,
): string | undefined {
  let stepStartIndex = -1
  let closedAfterStart = false
  for (const event of events.reverseValuesOf(['step/start', 'step/end', 'turn/end'], 0, end)) {
    if (event.type === 'step/end' || event.type === 'turn/end') closedAfterStart = true
    if (event.type === 'step/start'
      && event.data.turn === turn
      && event.data.step === step) {
      stepStartIndex = event.seq
      break
    }
  }
  if (stepStartIndex < 0 || closedAfterStart) return undefined
  for (const event of events.reverseValuesOf(['request/header'], 0, end)) {
    return event.data.header.config.provider
  }
  return undefined
}
