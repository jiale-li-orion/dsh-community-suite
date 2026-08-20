import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { ContextRunId, type Agent, type ContextRunAgent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import SessionStore, { Session, SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { MockAdapter, textResponse } from './mock-adapter.ts'

async function harness(adapter: MockAdapter): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  ctx.llm.registerAdapter(['mock'], adapter)
  return ctx
}

function send(agent: Agent, text: string): void {
  agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
}

describe('Agent', () => {
  it('idle inject() durably stages context without opening a turn', async () => {
    const adapter = new MockAdapter([textResponse('ok')])
    const ctx = await harness(adapter)
    const agent = ctx.agentLoop.create(SessionId('a1'), { provider: 'mock', model: 'mock' })

    agent.inject(createUserMessage({ content: [{ type: 'text', text: 'context' }], source: { kind: 'plugin', plugin: 'p' } }))

    expect(agent.session.events.map(event => event.type)).toEqual(['agent/inbox/spliced'])
    expect(agent.status).toBe('idle')
    expect(adapter.requests).toHaveLength(0)
    await agent.whenIdle()
  })

  it('inject() preserves an explicitly empty plugin source', async () => {
    const ctx = await harness(new MockAdapter([textResponse('ok')]))
    const agent = ctx.agentLoop.create(SessionId('a1'), { provider: 'mock', model: 'mock' })

    agent.inject(createUserMessage({ content: [{ type: 'text', text: 'empty plugin source' }], source: { kind: 'plugin', plugin: '' } }))

    const injected = agent.session.events.at(-1)
    expect(injected?.type === 'agent/inbox/spliced' && injected.data.inserted[0]?.source)
      .toEqual({ kind: 'plugin', plugin: '' })
  })

  it('emits exact inserted, claimed, and discarded inbox messages', async () => {
    const ctx = await harness(new MockAdapter([textResponse('ok')]))
    const agent = ctx.agentLoop.create(SessionId('inbox-events'), { provider: 'mock', model: 'mock' })
    const inserted: unknown[] = []
    const claimed: unknown[] = []
    const discarded: unknown[] = []
    const lifecycle: string[] = []
    ctx.on('session/event', (session, event) => {
      if (session === agent.session && event.type === 'turn/start') lifecycle.push('turn/start')
    })
    ctx.on('agent/inbox/inserted', ({ agent: subject, message }) => {
      if (subject === agent) inserted.push({ message })
    })
    ctx.on('agent/inbox/claimed', ({ agent: subject, message, turn }) => {
      if (subject === agent) {
        lifecycle.push('agent/inbox/claimed')
        claimed.push({ message, turn })
      }
    })
    ctx.on('agent/inbox/discarded', ({ agent: subject, message }) => {
      if (subject === agent) discarded.push({ message })
    })
    const context = createUserMessage({
      content: [{ type: 'text', text: 'discard me' }],
      source: { kind: 'plugin', plugin: 'test' },
    })
    agent.inject(context)
    agent.inbox.remove(context.id)
    const prompt = createUserMessage({ content: [{ type: 'text', text: 'run' }], source: { kind: 'user' } })
    agent.followup(prompt)
    await agent.whenIdle()

    expect(inserted).toEqual([{ message: context }, { message: prompt }])
    expect(discarded).toEqual([{ message: context }])
    expect(claimed).toEqual([{ message: prompt, turn: 1 }])
    expect(lifecycle).toEqual(['turn/start', 'agent/inbox/claimed'])
  })

  it('idle inject() rejects invalid input before enqueue', async () => {
    const ctx = await harness(new MockAdapter([textResponse('ok')]))
    const agent = ctx.agentLoop.create(SessionId('a1'), { provider: 'mock', model: 'mock' })

    expect(() => {
      agent.inject(createUserMessage({ content: [{ type: 'text', text: 'x', bad: 1n } as never], source: { kind: 'plugin', plugin: 'p' } }))
    }).toThrow(/non-JSON-serializable/)
    expect(agent.session.events).toHaveLength(0)
  })

  it('steer() while idle becomes a woken prompt turn', async () => {
    const adapter = new MockAdapter([textResponse('ok')])
    const ctx = await harness(adapter)
    const agent = ctx.agentLoop.create(SessionId('a1'), { provider: 'mock', model: 'mock' })

    agent.steer(createUserMessage({ content: [{ type: 'text', text: 'steer idle' }], source: { kind: 'plugin', plugin: 'test' } }))
    await agent.whenIdle()

    expect(agent.session.events.some(event => event.type === 'user/message')).toBe(true)
    expect(adapter.requests).toHaveLength(1)
  })

  it('runs from a committed replacement without appending a fabricated user message', async () => {
    const adapter = new MockAdapter([textResponse('first answer'), textResponse('rewritten answer')])
    const ctx = await harness(adapter)
    const agent = ctx.agentLoop.create(SessionId('context-run'), {
      provider: 'mock', model: 'mock',
    }) as ContextRunAgent
    send(agent, 'original')
    await agent.whenIdle()

    const shadowed = [...agent.session.surface.nodes]
    const replacement = agent.session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'edited' }],
      source: { kind: 'user' },
    }), {
      surfaceOp: { op: 'replace', start: shadowed[0]!, end: shadowed.at(-1)! },
      sourceEventSeqs: shadowed,
    })
    const userMessagesBefore = [...agent.session.readLog().valuesOf(['user/message'])]

    agent.runFromContext({
      contextRunId: ContextRunId('context-run-1'),
      generationSeq: replacement.seq,
      source: { kind: 'context-rewrite' },
    })
    await agent.whenIdle()

    expect(userMessagesBefore).toHaveLength(2)
    expect([...agent.session.readLog().valuesOf(['user/message'])]).toHaveLength(2)
    expect(agent.session.events.filter(event => event.type.startsWith('agent/context-run')).map(event => ({
      type: event.type,
      data: event.data,
    }))).toEqual([
      {
        type: 'agent/context-run/requested',
        data: {
          contextRunId: 'context-run-1',
          generationSeq: replacement.seq,
          source: { kind: 'context-rewrite' },
        },
      },
      {
        type: 'agent/context-run/claimed',
        data: { contextRunId: 'context-run-1', turn: 2 },
      },
    ])
    expect(adapter.requests).toHaveLength(2)
    expect(adapter.requests[1]?.messages.map(message => message.content)).toEqual([
      [{ type: 'text', text: 'edited' }],
    ])
  })

  it('orders a maintenance-requested context run before a later queued turn', async () => {
    const adapter = new MockAdapter([
      textResponse('first answer'),
      textResponse('rewritten answer'),
      textResponse('queued answer'),
    ])
    const ctx = await harness(adapter)
    const agent = ctx.agentLoop.create(SessionId('context-run-maintenance'), {
      provider: 'mock', model: 'mock',
    }) as ContextRunAgent
    send(agent, 'original')
    await agent.whenIdle()
    const shadowed = [...agent.session.surface.nodes]
    const replacement = agent.session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'edited' }], source: { kind: 'user' },
    }), {
      surfaceOp: { op: 'replace', start: shadowed[0]!, end: shadowed.at(-1)! },
      sourceEventSeqs: shadowed,
    })
    const release = Promise.withResolvers<undefined>()

    const maintenance = agent.runMaintenance(async () => {
      agent.runFromContext({
        contextRunId: ContextRunId('maintenance-run'),
        generationSeq: replacement.seq,
        source: { kind: 'context-rewrite' },
      })
      send(agent, 'queued after rewrite')
      await release.promise
    })
    expect(adapter.requests).toHaveLength(1)
    release.resolve(undefined)
    await maintenance
    await agent.whenIdle()

    expect(adapter.requests).toHaveLength(3)
    expect(adapter.requests[1]?.messages.map(message => message.content)).toEqual([
      [{ type: 'text', text: 'edited' }],
    ])
    expect(adapter.requests[2]?.messages.at(-1)?.content).toEqual([
      { type: 'text', text: 'queued after rewrite' },
    ])
    expect(agent.session.events.filter(event => event.type === 'turn/start').map(event => event.data.turn))
      .toEqual([1, 2, 3])
  })

  it('resumes one durable unclaimed context run after publication', async () => {
    const adapter = new MockAdapter([textResponse('resumed answer')])
    const ctx = await harness(adapter)
    const seed = Session.create(SessionId('context-run-seed'))
    const original = seed.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'original' }], source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    const replacement = seed.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'edited' }], source: { kind: 'user' },
    }), {
      surfaceOp: { op: 'replace', start: original.seq, end: original.seq },
      sourceEventSeqs: [original.seq],
    })
    seed.append('agent/context-run/requested', {
      contextRunId: ContextRunId('restored-run'),
      generationSeq: replacement.seq,
      source: { kind: 'context-rewrite' },
    })

    const handle = await ctx.agents.create({
      sessionId: SessionId('context-run-restored'),
      seed: seed.events,
      agentOptions: { provider: 'mock', model: 'mock' },
    })
    await handle.agent.whenIdle()

    expect(adapter.requests).toHaveLength(1)
    expect(adapter.requests[0]?.messages.map(message => message.content)).toEqual([
      [{ type: 'text', text: 'edited' }],
    ])
    expect(handle.agent.session.events.find(event => event.type === 'agent/context-run/claimed')?.data)
      .toEqual({ contextRunId: 'restored-run', turn: 1 })
    await handle.dispose()
  })

  it('cancels a restored stale context run without opening an empty turn', async () => {
    const adapter = new MockAdapter([])
    const ctx = await harness(adapter)
    const seed = Session.create(SessionId('stale-context-run-seed'))
    const original = seed.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'original' }], source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    const firstReplacement = seed.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'first edit' }], source: { kind: 'user' },
    }), {
      surfaceOp: { op: 'replace', start: original.seq, end: original.seq },
      sourceEventSeqs: [original.seq],
    })
    seed.append('agent/context-run/requested', {
      contextRunId: ContextRunId('stale-restored-run'),
      generationSeq: firstReplacement.seq,
      source: { kind: 'context-rewrite' },
    })
    seed.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'newer edit' }], source: { kind: 'user' },
    }), {
      surfaceOp: { op: 'replace', start: firstReplacement.seq, end: firstReplacement.seq },
      sourceEventSeqs: [firstReplacement.seq],
    })

    const handle = await ctx.agents.create({
      sessionId: SessionId('stale-context-run-restored'),
      seed: seed.events,
      agentOptions: { provider: 'mock', model: 'mock' },
    })
    await handle.agent.whenIdle()

    expect(adapter.requests).toHaveLength(0)
    expect([...handle.agent.session.readLog().valuesOf(['turn/start'])]).toHaveLength(0)
    expect([...handle.agent.session.readLog().valuesOf(['agent/context-run/cancelled'])].at(-1)?.data)
      .toEqual({ contextRunId: 'stale-restored-run', reason: 'stale-generation' })
    await handle.dispose()
  })

  it('emits one running and idle transition for one completed turn', async () => {
    const ctx = await harness(new MockAdapter([textResponse('ok')]))
    const agent = ctx.agentLoop.create(SessionId('a1'), { provider: 'mock', model: 'mock' })
    const statuses: string[] = []
    ctx.on('agent/status', ({ agent: subject, status }) => {
      if (subject === agent) statuses.push(status)
    })

    send(agent, 'hi')
    await agent.whenIdle()

    expect(statuses).toEqual(['running', 'idle'])
  })

  it('whenIdle() resolves immediately without active work', async () => {
    const ctx = await harness(new MockAdapter([textResponse('ok')]))
    const agent = ctx.agentLoop.create(SessionId('a1'), { provider: 'mock', model: 'mock' })

    await agent.whenIdle()

    expect(agent.status).toBe('idle')
  })

  it('whenIdle() waits for active work until explicit cancellation', async () => {
    const ctx = await harness(new MockAdapter(['hang']))
    const agent = ctx.agentLoop.create(SessionId('a1'), { provider: 'mock', model: 'mock' })

    send(agent, 'queued')
    let settled = false
    const idle = agent.whenIdle().then(() => { settled = true })
    await Promise.resolve()
    expect(settled).toBe(false)

    agent.cancel({ kind: 'user' })
    await idle
    expect(agent.status).toBe('idle')
  })

  it('contains a throwing status listener on both transitions', async () => {
    const ctx = await harness(new MockAdapter([textResponse('ok')]))
    const warn = vi.spyOn(ctx.logger, 'warn').mockImplementation(() => undefined)
    const agent = ctx.agentLoop.create(SessionId('a1'), { provider: 'mock', model: 'mock' })
    ctx.on('agent/status', ({ status }) => {
      throw new Error(`bad ${status} listener`)
    })

    send(agent, 'go')
    await agent.whenIdle()

    expect(agent.status).toBe('idle')
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('agent event "agent/status" listener threw'),
    )
  })
})
