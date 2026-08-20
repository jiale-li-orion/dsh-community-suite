/** Chat marker for one same-Session context rewrite. */

import type { Context } from '@deepseek-ai/cordis'
import type {
  ConversationMatch,
  ConversationNodeContext,
  ConversationNodeDefinition,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ChatNodeDataMap } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './ContextRewriteNode.module.css'

/** Renderer-owned rewrite marker data. */
export interface ContextRewriteChatData {
  readonly mode: 'edit-and-continue' | 'patch'
  readonly shadowedItemCount: number
  readonly shadowedTokenCount: number
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ChatNodeDataMap {
    /** Same-Session context rewrite marker. */
    'context-rewrite': ContextRewriteChatData
  }
}

interface ContextRewriteState {
  readonly match: ConversationMatch
}

const definition: ConversationNodeDefinition<ContextRewriteState> = {
  kind: 'context-rewrite',
  target: 'chat',
  match: event => event.type === 'context/rewrite'
    ? { id: event.data.rewriteId, role: 'start' }
    : null,
  start: (_context, match) => ({ match }),
  update: context => context.state,
  buildViewNode: context => rewriteNode(context),
}

function rewriteNode(context: ConversationNodeContext<ContextRewriteState>) {
  const event = context.state?.match.event
  if (event?.type !== 'context/rewrite') return null
  const data: ChatNodeDataMap['context-rewrite'] = {
    mode: event.data.mode,
    shadowedItemCount: event.data.shadowedSeqs.length,
    shadowedTokenCount: event.data.shadowedTokenCount,
  }
  return {
    key: context.key,
    kind: 'context-rewrite',
    id: context.id,
    target: 'chat' as const,
    anchorSeq: event.seq,
    location: context.start?.location ?? { kind: 'unresolved' as const },
    visibility: 'visible' as const,
    data,
  }
}

interface Injected {
  openContext: () => void
}

type Props = PropsRuntime<'conversation.chat.node', 'context-rewrite'>
  & InjectFace<Injected>
  & PropsLocale<'sessionContext'>

/** Render a durable rewrite marker without removing any Chat rows. */
export function ContextRewriteNode({ node, openContext, t }: Props) {
  const data = node.data
  return (
    <div className={css.root}>
      <div>
        <strong>{t('rewrite.markerTitle')}</strong>
        <span>
          {data.mode === 'patch'
            ? t('rewrite.markerPatch')
            : t('rewrite.markerEdit', {
              count: data.shadowedItemCount,
              tokens: data.shadowedTokenCount,
            })}
        </span>
      </div>
      <Button size="sm" variant="toolbar" onClick={openContext}>{t('rewrite.openContext')}</Button>
    </div>
  )
}

/** Register the rewrite business Definition and keyed Chat renderer. */
export function registerContextRewriteNode(ctx: Context, openContext: (sessionId: string) => void): void {
  ctx.conversationEvents.register(definition)
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'context-rewrite',
    locale: 'sessionContext',
    inject: (sessionId): Injected => ({ openContext: () => { openContext(sessionId) } }),
  }, ContextRewriteNode))
}
