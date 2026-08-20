/**
 * Durable agent session-event vocabulary shared with type-only consumers.
 *
 * @module @deepseek-ai/dsh-agent/types
 */

import type { UserMessage } from '@deepseek-ai/dsh-llm/types'
import type { ContextRunId } from './brand.ts'

/** One of the two ordered pending-message lists owned by an agent. */
export type InboxTarget = 'next-turn' | 'next-step'

/** Durable request to run the next turn from a previously committed surface replacement. */
export interface ContextRunRequest {
  /** Caller-minted lifecycle identity. */
  readonly contextRunId: ContextRunId
  /** Replacement event seq identifying the context generation to run. */
  readonly generationSeq: number
  /** Current producer of context-run work. */
  readonly source: { readonly kind: 'context-rewrite' }
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * One normalized mutation of an agent's durable pending-message lists.
     * Live dispatch precedes projection mutation, so synchronous observers may
     * read the pre-splice inbox to recover the removed messages.
     */
    'agent/inbox/spliced': {
      target: InboxTarget
      start: number
      removedCount?: number
      inserted: UserMessage[]
      outcome?: 'canceled'
    }
    /** A committed context generation requested a model turn without another user message. */
    'agent/context-run/requested': ContextRunRequest
    /** The loop claimed the request inside its owning turn. */
    'agent/context-run/claimed': { contextRunId: ContextRunId; turn: number }
    /** Pending work was discarded or no longer named the current context generation. */
    'agent/context-run/cancelled': {
      contextRunId: ContextRunId
      reason: 'cancelled' | 'stale-generation'
    }
  }
}
