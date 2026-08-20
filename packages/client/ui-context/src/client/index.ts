/** Browser plugin for exact current-context inspection and same-Session rewrite. */

import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: generated Remote namespace and ctx.remote merge.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: conversation view, Context-meter slot, and scoped service merge.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: locale service Context merge.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { SessionContextController } from './controller.ts'
import { ContextMeterAction } from './ContextMeterAction.tsx'
import { ContextView } from './ContextView.tsx'
import { registerContextRewriteNode } from './context-rewrite-node.tsx'
import { en, NS, zh } from './locales.ts'
import { createContextViewStore } from './store.ts'
import type { ContextMeterActionInjected, ContextViewInjected } from './slots.ts'

/** Required services for slots, Remote reads, Session observation, scoped view selection, and copy. */
export const inject = [
  'slots', 'sessions', 'remote', 'remote.sessionContext', 'conversation', 'conversationEvents', 'locale',
]

/** Mount the Context view and its occupancy-popover action. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-context: dictionaries')
  const t = ctx.locale.bind(NS)
  const store = createContextViewStore()
  const controllers = new Map<SessionId, SessionContextController>()

  const openContext = (sessionId: string): void => {
    const scoped = ctx.sessions.scope(sessionId as SessionId)
    const conversation = scoped?.get('conversation')
    if (conversation === undefined) throw new Error(`ui-context: session "${sessionId}" has no conversation service`)
    conversation.selectView('context')
  }

  registerContextRewriteNode(ctx, openContext)

  const controllerFor = (sessionId: SessionId): SessionContextController => {
    let controller = controllers.get(sessionId)
    if (controller !== undefined) return controller
    const session = ctx.sessions.binding(sessionId)?.session
    if (session === undefined) throw new Error(`ui-context: session "${sessionId}" is unavailable`)
    controller = new SessionContextController(ctx.remote.sessionContext, sessionId, session)
    controllers.set(sessionId, controller)
    return controller
  }

  ctx.effect(() => () => {
    for (const controller of controllers.values()) controller.dispose()
    controllers.clear()
  }, 'ui-context: per-session controllers')

  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'context',
    order: 5,
    label: () => t('view.context'),
    locale: NS,
    store,
    inject: (sessionId: SessionId): ContextViewInjected => {
      const controller = controllerFor(sessionId)
      return {
        hooks: { context: controller },
        activate: () => controller.activate(),
        refresh: () => controller.refresh(),
        loadEarlier: () => controller.loadEarlier(),
        readUnit: unitId => controller.readUnit(unitId),
        rewrite: request => controller.rewrite(request),
        prepare: request => controller.prepare(request),
        editPreparation: request => controller.editPreparation(request),
        discardPreparation: request => controller.discardPreparation(request),
        commitPreparation: request => controller.commitPreparation(request),
        readHistory: (checkpointId, more) => controller.readHistory(checkpointId, more),
        searchHistory: (checkpointId, query, more) => controller.searchHistory(checkpointId, query, more),
      }
    },
  }, ContextView))

  ctx.slots.inject('conversation.context-meter.action', () => ctx.slots.register({
    name: 'conversation.context-meter.action',
    locale: NS,
    inject: (sessionId: SessionId): ContextMeterActionInjected => ({
      openContext: () => {
        openContext(sessionId)
      },
    }),
  }, ContextMeterAction))
}
