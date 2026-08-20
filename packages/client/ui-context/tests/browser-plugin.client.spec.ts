/** Browser plugin registration and HMR teardown over the real slot and Definition registries. */

import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { ConversationEventRegistry, SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'
import { NS, zh } from '../src/client/locales.ts'

/** Boot the browser half over the three declarations it contributes to. */
async function bench(): Promise<{
  ctx: Context
  slots: SlotRegistry
  events: ConversationEventRegistry
  locale: LocaleRuntime
  fiber: ReturnType<Context['plugin']>
}> {
  const ctx = new Context()
  const slots = new SlotRegistry(ctx)
  const events = new ConversationEventRegistry(ctx)
  slots.register({
    name: 'root',
    children: {
      'conversation.view': { kind: 'list', scope: 'session' },
      'conversation.context-meter.action': { kind: 'single', scope: 'session' },
      'conversation.chat.node': { kind: 'keyed', scope: 'session' },
    },
  } as never, () => null)
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  ctx.provide('sessions', { binding: () => undefined, scope: () => undefined })
  ctx.provide('conversation', {})
  class RemoteService extends Service {
    constructor(serviceContext: Context) {
      super(serviceContext, 'remote')
    }
  }
  new RemoteService(ctx)
  ctx.provide('remote.sessionContext', {})
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, slots, events, locale, fiber }
}

describe('ui-context browser plugin', () => {
  it('declares every service it reads', () => {
    expect(inject).toEqual([
      'slots', 'sessions', 'remote', 'remote.sessionContext', 'conversation', 'conversationEvents', 'locale',
    ])
  })

  it('registers the Context surfaces and removes all contributions on fiber disposal', async () => {
    const { slots, events, locale, fiber } = await bench()
    expect(slots.entries('conversation.view').map(entry => entry.options.id)).toEqual(['context'])
    expect(slots.entries('conversation.context-meter.action')).toHaveLength(1)
    expect(slots.entries('conversation.chat.node').map(entry => entry.options.key)).toEqual(['context-rewrite'])
    expect(events.entries().map(definition => definition.kind)).toEqual(['context-rewrite'])
    expect(locale.bind(NS)('view.context')).toBe(zh['view.context'])

    await fiber.dispose()

    expect(slots.entries('conversation.view')).toEqual([])
    expect(slots.entries('conversation.context-meter.action')).toEqual([])
    expect(slots.entries('conversation.chat.node')).toEqual([])
    expect(events.entries()).toEqual([])
    expect(locale.bind(NS)('view.context')).not.toBe(zh['view.context'])
  })
})
