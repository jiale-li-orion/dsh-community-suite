/** Trajectory records for Context preparations, rewrites, and zero-message continuations. */

import type { Context } from '@deepseek-ai/cordis'
import type { ConversationMatch, ConversationNodeDefinition } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-session-context/types'
import { trajectoryNode } from './trajectory-definition-common.ts'

interface ContextManagementState {
  readonly match: ConversationMatch
}

/** Context-management events that belong in the complete execution ledger. */
function matchesContextManagement(event: Parameters<ConversationNodeDefinition['match']>[0]): boolean {
  switch (event.type) {
    case 'context/rewrite':
    case 'agent/context-run/requested':
    case 'agent/context-run/claimed':
    case 'agent/context-run/cancelled':
    case 'compaction/preparation/requested':
    case 'compaction/preparation/planned':
    case 'compaction/preparation/attempted':
    case 'compaction/preparation/call':
    case 'compaction/preparation/ready':
    case 'compaction/preparation/edited':
    case 'compaction/preparation/failed':
    case 'compaction/preparation/discarded':
      return true
    default:
      return false
  }
}

const definition: ConversationNodeDefinition<ContextManagementState> = {
  kind: 'trajectory-context-management',
  target: 'trajectory',
  match: event => matchesContextManagement(event)
    ? { id: String(event.seq), role: 'start' }
    : null,
  start: (_context, match) => ({ match }),
  update: context => context.state,
  buildViewNode: (context) => {
    const event = context.state?.match.event
    return event === undefined
      ? null
      : trajectoryNode(context, event.seq, {
        kind: 'node',
        node: {
          kind: 'unknown',
          seq: event.seq,
          time: event.time,
          type: event.type,
          data: event.data,
        },
      })
  },
}

/**
 * Register Context-management events in Trajectory's complete ledger.
 * @param ctx - client Context that owns the Conversation Definition registry.
 */
export function registerTrajectoryContextManagementDefinition(ctx: Context): void {
  ctx.conversationEvents.register(definition)
}
