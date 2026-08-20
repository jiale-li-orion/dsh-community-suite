/**
 * Crash-recovery repair for an interrupted session log. It preserves a fully
 * written final turn and supplies the missing tool, step, and turn boundaries
 * needed to resume with a provider-valid transcript.
 * @module @deepseek-ai/dsh-session/repair
 */

import { MessageId, freezeMessage, type CallId } from '@deepseek-ai/dsh-llm'
import type { ToolResultMessage } from '@deepseek-ai/dsh-llm'
import { chunkRowAt, chunkRowLength, isChunkRow } from './chunk-rows.ts'
import type { StorageRecord } from './chunk-rows.ts'
import type { SessionEvent, SessionEventType } from './types.ts'

/** Recovery code for an assistant tool request that never reached a recorded call start. */
export const TOOL_NOT_STARTED = 'TOOL_NOT_STARTED'

/** Recovery code for a recorded tool call whose completed outcome was not durably recorded. */
export const TOOL_OUTCOME_UNKNOWN = 'TOOL_OUTCOME_UNKNOWN'

interface InterruptedTurnState {
  openTurn: number | null
  openStep: number | null
  pendingCalls: Map<CallId, { step: number; callSeq?: number }>
  last: SessionEvent | undefined
}

/** Create one mutable fold state for interrupted-tail recovery. */
function createInterruptedTurnState(): InterruptedTurnState {
  return {
    openTurn: null,
    openStep: null,
    pendingCalls: new Map(),
    last: undefined,
  }
}

/** Fold one logical event into interrupted-tail recovery state. */
function foldInterruptedTurn(state: InterruptedTurnState, event: SessionEvent): void {
  state.last = event
  const { pendingCalls } = state
  switch (event.type) {
    case 'turn/start':
      state.openTurn = event.data.turn
      state.openStep = null
      pendingCalls.clear()
      break
    case 'turn/end':
      state.openTurn = null
      state.openStep = null
      pendingCalls.clear()
      break
    case 'step/start':
      state.openStep = event.data.step
      break
    case 'step/end':
      pendingCalls.clear()
      state.openStep = null
      break
    case 'assistant/message':
      for (const block of event.data.message.content) {
        if (block.type === 'tool-call') pendingCalls.set(block.id, { step: event.data.step })
      }
      break
    case 'tool/call': {
      const entry = pendingCalls.get(event.data.callId)
      if (entry) entry.callSeq = event.seq
      break
    }
    case 'tool/result':
      pendingCalls.delete(event.data.message.source.callId)
      break
    default:
      break
  }
}

/** Build deterministic closer events from a completed recovery fold. */
function finishInterruptedTurn(state: InterruptedTurnState): SessionEvent[] {
  const { openTurn, openStep, pendingCalls, last } = state
  if (openTurn === null || last === undefined) return []

  let seq = last.seq + 1
  const time = last.time
  const closers: SessionEvent[] = []

  for (const [callId, { step, callSeq }] of pendingCalls) {
    const started = callSeq !== undefined
    const message: ToolResultMessage = freezeMessage({
      id: MessageId(`interrupted-tool-result-${callId}-${seq}`),
      role: 'user',
      source: { kind: 'tool', callId },
      content: [{
        type: 'tool-result',
        toolCallId: callId,
        isError: true,
        content: [{
          type: 'text',
          text: started
            ? 'The tool call was interrupted after it was recorded, but no result was durably recorded. Its outcome is unknown. Decide whether to retry from the tool semantics: retry only if the operation is read-only or idempotent; if it may have side effects, first verify external state or ask the user. Do not retry blindly.'
            : 'The tool call was interrupted before the Harness recorded it as started. Retry it if it is still needed.',
        }],
      }],
    })
    closers.push({
      type: 'tool/result',
      seq: seq++,
      time,
      data: {
        turn: openTurn,
        step,
        message,
        error: started
          ? { name: 'ToolOutcomeUnknownError', code: TOOL_OUTCOME_UNKNOWN }
          : { name: 'ToolNotStartedError', code: TOOL_NOT_STARTED },
      },
      surfaceOp: 'append',
      ...started ? { sourceEventSeqs: [callSeq] } : {},
    })
  }

  if (openStep !== null) {
    closers.push({ type: 'step/end', seq: seq++, time, data: { turn: openTurn, step: openStep } })
  }
  closers.push({ type: 'turn/end', seq: seq++, time, data: { turn: openTurn, reason: { kind: 'interrupted' } } })
  return closers
}

/**
 * Return deterministic synthetic events that close an open tail turn. Unmatched
 * calls receive error results first, followed by an open `step/end` and an
 * interrupted `turn/end`; sequences continue the log and timestamps reuse the
 * last real event. A balanced or empty log returns no events.
 * @param events - loaded durable events in contiguous sequence order.
 * @returns synthetic events to append, or an empty array for a balanced log.
 */
export function interruptedTurnClosers(events: readonly SessionEvent[]): SessionEvent[] {
  const state = createInterruptedTurnState()
  for (const event of events) foldInterruptedTurn(state, event)
  return finishInterruptedTurn(state)
}

interface RepairLogCut {
  readonly length: number
  at(seq: number): SessionEvent | undefined
  valuesOf(types: readonly SessionEventType[], from?: number, to?: number): Iterable<SessionEvent>
}

const REPAIR_EVENT_TYPES = [
  'turn/start',
  'turn/end',
  'step/start',
  'step/end',
  'assistant/message',
  'tool/call',
  'tool/result',
] satisfies readonly SessionEventType[]

/**
 * Return interrupted-tail closers from an indexed logical log without
 * decoding unrelated events. The final point read supplies the exact sequence
 * and timestamp for synthetic events when the turn remains open.
 * @param log - stable logical log cut.
 * @returns deterministic closer events, or an empty array for a balanced log.
 */
export function interruptedTurnClosersFromLog(log: RepairLogCut): SessionEvent[] {
  const state = createInterruptedTurnState()
  for (const event of log.valuesOf(REPAIR_EVENT_TYPES)) foldInterruptedTurn(state, event)
  if (state.openTurn !== null && log.length > 0) state.last = log.at(log.length - 1)
  return finishInterruptedTurn(state)
}

/**
 * Return interrupted-tail closers from storage records without expanding
 * packed assistant delta runs. Only the final member of a packed tail is
 * decoded because its sequence and timestamp anchor synthetic events.
 * @param records - validated storage records in contiguous logical order.
 * @returns deterministic closer events, or an empty array for a balanced log.
 */
export function interruptedTurnClosersFromRecords(records: readonly StorageRecord[]): SessionEvent[] {
  const state = createInterruptedTurnState()
  for (const record of records) {
    if (!isChunkRow(record)) foldInterruptedTurn(state, record)
  }
  const tail = records.at(-1)
  if (state.openTurn !== null && tail !== undefined && isChunkRow(tail)) {
    state.last = chunkRowAt(tail, chunkRowLength(tail) - 1)
  }
  return finishInterruptedTurn(state)
}
