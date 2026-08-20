/**
 * The session-log record of which preset a session actually runs.
 *
 * The creation header names the preset a session STARTED with, and it is
 * deep-frozen because that is a creation fact. A session may still change
 * preset while it is blank, and the effect of that change outlives the blank
 * window: the first turn — and every turn after it — runs under the newly
 * mounted composition. Recording the change is what keeps the log honest, and
 * it is required outright by the repo's model-visible ⟺ logged rule, since the
 * preset decides the tool schemas and prompt sections the model sees.
 *
 * Reconstruction reads {@link resolveSessionPreset}, never the header alone.
 * @module @deepseek-ai/dsh-agent-presets/session
 */

import { SessionEventFold } from '@deepseek-ai/dsh-session'
import type { Session, SessionEvent, SessionHeader, SessionLogCut } from '@deepseek-ai/dsh-session'

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * The session's agent preset was chosen after creation, while the session
     * was still blank. Log-only: it records the composition later turns ran
     * under, so a resumed or forked session rebuilds the same one instead of
     * the header's creation-time value.
     */
    'agent-preset/selected': { agentPreset: string }
  }
}

/** Expanded detached representation accepted by preset reconstruction. */
export interface StoredPresetBearingSession {
  /** The session's creation header. */
  readonly header: SessionHeader
  /** The session's event log in ascending sequence order. */
  readonly events: readonly SessionEvent[]
}

/** Stable detached representation accepted by preset reconstruction. */
export interface LogPresetBearingSession {
  /** The session's creation header. */
  readonly header: SessionHeader
  /** Stable logical log cut, which may retain packed stream rows. */
  readonly log: Pick<SessionLogCut, 'valuesOf'>
}

/** Live or detached representation accepted by preset reconstruction. */
export type PresetBearingSession = Session | StoredPresetBearingSession | LogPresetBearingSession

interface LivePresetState {
  selected: string | undefined
}

const livePresetFolds = new SessionEventFold<LivePresetState>(
  () => ({ selected: undefined }),
  (state, event) => {
    if (event.type === 'agent-preset/selected') state.selected = event.data.agentPreset
  },
  ['agent-preset/selected'],
)

/**
 * The preset a session actually runs, newest selection winning.
 *
 * The header supplies the creation-time value; every later selection is a
 * logged event, so the last one is the answer. Reading the header alone
 * rebuilds a switched session under the composition it was created with, not
 * the one its history was produced under.
 * @param session - the session's header and event log.
 * @returns the preset id, or `undefined` when the deployment composes none.
 */
export function resolveSessionPreset(session: PresetBearingSession): string | undefined {
  if ('readLog' in session) {
    return livePresetFolds.read(session).selected ?? session.header.agentPreset
  }
  if ('log' in session) {
    let selected: string | undefined
    for (const event of session.log.valuesOf(['agent-preset/selected'])) {
      selected = event.data.agentPreset
    }
    return selected ?? session.header.agentPreset
  }
  for (let index = session.events.length - 1; index >= 0; index -= 1) {
    const event = session.events[index]
    if (event?.type === 'agent-preset/selected') return event.data.agentPreset
  }
  return session.header.agentPreset
}
