import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import BasicCompactionEngine from '@deepseek-ai/dsh-compaction-basic'
import { CompactionId, CompactionPreparationId, compactCheckpointSource } from '@deepseek-ai/dsh-compaction'
import CompactionDirectory from '@deepseek-ai/dsh-compaction/src/directory.ts'
import LlmRuntime, { LlmAdapter, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionContextService from '@deepseek-ai/dsh-session-context'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import TokenMeter from '@deepseek-ai/dsh-token-meter'
import ToolRuntime from '@deepseek-ai/dsh-tools'

const MAX_TOKENS_REPLY = '__max_tokens__'

class ScriptedAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []

  constructor(private readonly replies: readonly string[]) {
    super()
  }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({
      provider,
      id: model,
      name: model,
      context: { contextWindow: 1_000_000 },
      maxOutputTokens: 256_000,
    })
  }

  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    const text = this.replies[this.requests.length - 1] ?? 'ok'
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: text === MAX_TOKENS_REPLY ? 'partial summary' : text }
    yield { type: 'finish', reason: { kind: text === MAX_TOKENS_REPLY ? 'max-tokens' : 'stop' } }
  }
}

async function harness(replies: readonly string[] = ['answer']): Promise<{
  ctx: Context
  adapter: ScriptedAdapter
}> {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(TokenMeter)
  await ctx.plugin(CompactionDirectory)
  await ctx.plugin(SessionContextService, { previewChars: 64 })
  await ctx.plugin(BasicCompactionEngine, {
    auto: false,
    preparationConcurrency: 2,
  })
  await ctx.plugin(AgentLoop, { agents: [] })
  const adapter = new ScriptedAdapter(replies)
  ctx.llm.registerAdapter(['mock'], adapter)
  return { ctx, adapter }
}

function prompt(agent: ReturnType<AgentLoop['create']>, text: string): void {
  agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
}

describe('SessionContextService', () => {
  it('projects stable balanced units without reading the human transcript', async () => {
    const { ctx } = await harness()
    const agent = ctx.agentLoop.create(SessionId('inspect-context'), { provider: 'mock', model: 'mock' })
    prompt(agent, 'hello context')
    await agent.whenIdle()

    const first = await ctx.sessionContext.inspect(agent, {}, new AbortController().signal)
    expect(first.sessionId).toBe(agent.id)
    expect(first.route).toEqual({ provider: 'mock', model: 'mock' })
    expect(first.units.map(unit => ({ role: unit.role, kind: unit.kind, balanced: unit.balanced }))).toEqual([
      { role: 'user', kind: 'message', balanced: true },
      { role: 'assistant', kind: 'message', balanced: true },
    ])
    expect(first.units[0]?.preview).toBe('hello context')
    expect(first.surfaceTokens).toBeGreaterThan(0)
    expect(first).toMatchObject({ unitCount: 2, unitOffset: 0, hasEarlierUnits: false })

    const tail = await ctx.sessionContext.inspect(agent, { maxUnits: 1 }, new AbortController().signal)
    expect(tail).toMatchObject({ unitCount: 2, unitOffset: 1, hasEarlierUnits: true })
    expect(tail.units[0]?.role).toBe('assistant')
    const older = await ctx.sessionContext.inspect(agent, {
      beforeIndex: tail.unitOffset,
      maxUnits: 1,
    }, new AbortController().signal)
    expect(older).toMatchObject({ unitOffset: 0, hasEarlierUnits: false })
    expect(older.units[0]?.preview).toBe('hello context')

    agent.session.append('todo/write', { todos: [] })
    const second = await ctx.sessionContext.inspect(agent, {}, new AbortController().signal)
    expect(second.logRevision).toBe(first.logRevision + 1)
    expect(second.units.map(unit => unit.id)).toEqual(first.units.map(unit => unit.id))

    const detail = ctx.sessionContext.readUnit(agent, second.units[0]!.id, new AbortController().signal)
    expect(detail.messages).toHaveLength(1)
    expect(detail.messages[0]?.content).toEqual([{ type: 'text', text: 'hello context' }])
  })

  it('edits one unit through the current tail and continues without another prompt', async () => {
    const { ctx, adapter } = await harness(['first answer', 'rewritten answer'])
    const agent = ctx.agentLoop.create(SessionId('rewrite-context'), { provider: 'mock', model: 'mock' })
    prompt(agent, 'original request')
    await agent.whenIdle()
    const before = await ctx.sessionContext.inspect(agent, {}, new AbortController().signal)
    const target = before.units[0]!

    const result = await ctx.sessionContext.rewrite(agent, {
      unitId: target.id,
      expectedTailSeq: before.tailSeq!,
      mode: 'edit-and-continue',
      text: 'edited request',
      continue: true,
    }, new AbortController().signal)
    await agent.whenIdle()

    expect(result.shadowedItemCount).toBe(2)
    expect(result.contextRunId).toBeDefined()
    expect(adapter.requests).toHaveLength(2)
    expect(adapter.requests[1]?.messages.map(message => message.content)).toEqual([
      [{ type: 'text', text: 'edited request' }],
    ])
    const after = await ctx.sessionContext.inspect(agent, {}, new AbortController().signal)
    expect(after.generationSeq).toBe(result.replacementSeq)
    expect(after.units.map(unit => unit.preview)).toEqual(['edited request', 'rewritten answer'])
    expect([...agent.session.readLog().valuesOf(['user/message', 'assistant/message'])])
      .toHaveLength(4)
  })

  it('patches one unit while retaining the dependent suffix only when requested', async () => {
    const { ctx, adapter } = await harness(['original answer'])
    const agent = ctx.agentLoop.create(SessionId('patch-context'), { provider: 'mock', model: 'mock' })
    prompt(agent, 'original request')
    await agent.whenIdle()
    const before = await ctx.sessionContext.inspect(agent, {}, new AbortController().signal)

    const result = await ctx.sessionContext.rewrite(agent, {
      unitId: before.units[0]!.id,
      expectedTailSeq: before.tailSeq!,
      mode: 'patch',
      text: 'patched request',
      continue: false,
    }, new AbortController().signal)

    expect(result.shadowedItemCount).toBe(1)
    expect(result.contextRunId).toBeUndefined()
    expect(adapter.requests).toHaveLength(1)
    expect(agent.session.deriveMessages().map(message => message.content)).toEqual([
      [{ type: 'text', text: 'patched request' }],
      [{ type: 'text', text: 'original answer' }],
    ])
  })

  it('retains server-authorized image blocks while replacing user prose', async () => {
    const { ctx } = await harness()
    const agent = ctx.agentLoop.create(SessionId('rewrite-image-context'), { provider: 'mock', model: 'mock' })
    const image = {
      type: 'image' as const,
      attachment: {
        attachmentId: 'image-owned-by-session' as never,
        mediaType: 'image/png' as const,
        bytes: 12,
        width: 1,
        height: 1,
      },
    }
    agent.session.append('user/message', createUserMessage({
      content: [image, { type: 'text', text: 'old caption' }],
      source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    const before = await ctx.sessionContext.inspect(agent, {}, new AbortController().signal)

    await ctx.sessionContext.rewrite(agent, {
      unitId: before.units[0]!.id,
      expectedTailSeq: before.tailSeq!,
      mode: 'patch',
      text: 'new caption',
      continue: false,
    }, new AbortController().signal)

    expect(agent.session.deriveMessages()[0]?.content).toEqual([
      image,
      { type: 'text', text: 'new caption' },
    ])
  })

  it('rejects a rewrite after the visible surface tail changes', async () => {
    const { ctx } = await harness(['answer'])
    const agent = ctx.agentLoop.create(SessionId('stale-context'), { provider: 'mock', model: 'mock' })
    prompt(agent, 'original')
    await agent.whenIdle()
    const before = await ctx.sessionContext.inspect(agent, {}, new AbortController().signal)
    agent.session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'new tail' }], source: { kind: 'user' },
    }), { surfaceOp: 'append' })

    await expect(ctx.sessionContext.rewrite(agent, {
      unitId: before.units[0]!.id,
      expectedTailSeq: before.tailSeq!,
      mode: 'edit-and-continue',
      text: 'edited',
      continue: false,
    }, new AbortController().signal)).rejects.toThrow(/context tail changed/)
  })

  it('prepares, reviews, and commits a stable middle range while retaining later appends', async () => {
    const { ctx, adapter } = await harness([
      'first answer '.repeat(80),
      'second answer '.repeat(80),
      '## Outcomes\n- generated summary\n\n## Decisions and Constraints\n- keep exact values',
    ])
    const agent = ctx.agentLoop.create(SessionId('reviewed-range-context'), { provider: 'mock', model: 'mock' })
    prompt(agent, 'first request '.repeat(80))
    await agent.whenIdle()
    prompt(agent, 'second request '.repeat(80))
    await agent.whenIdle()
    const before = await ctx.sessionContext.inspect(agent, {}, new AbortController().signal)
    const generation = before.replaceGeneration

    const prepared = await ctx.sessionContext.prepare(agent, {
      startUnitId: before.units[0]!.id,
      endUnitId: before.units[1]!.id,
      preservationBrief: 'Keep every exact value.',
    }, new AbortController().signal)

    expect(prepared).toMatchObject({
      status: 'ready',
      unitCount: 2,
      summarySource: 'generated',
      plan: {
        strategy: 'direct',
        provider: 'mock',
        model: 'mock',
        contextWindow: 1_000_000,
        modelMaxOutputTokens: 256_000,
      },
      attemptedCalls: 1,
      completedCalls: 1,
    })
    expect(agent.session.surface.replaceGeneration).toBe(generation)
    expect(adapter.requests[2]?.messages.map(message => message.content)
      .flat(2).map(block => block.type === 'text' ? block.text : '').join('\n'))
      .toContain('first request')
    expect(adapter.requests[2]?.messages.map(message => message.content)
      .flat(2).map(block => block.type === 'text' ? block.text : '').join('\n'))
      .not.toContain('second request')

    const edited = await ctx.sessionContext.editPreparation(agent, {
      preparationId: prepared.preparationId,
      text: '## Outcomes\n- reviewed exact result\n\n## Literal Anchors\n- value=42',
      source: 'human',
    }, new AbortController().signal)
    expect(edited.summarySource).toBe('human')

    agent.session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'later background remains outside the selected range' }],
      source: { kind: 'plugin', plugin: 'range-test' },
    }), { surfaceOp: 'append' })

    const committed = await ctx.sessionContext.commitPreparation(agent, {
      preparationId: prepared.preparationId,
    }, new AbortController().signal)
    expect(committed.shadowedSeqs).toEqual(before.units.slice(0, 2).flatMap(unit => (
      unit.startSeq === unit.endSeq ? [unit.startSeq] : [unit.startSeq, unit.endSeq]
    )))
    expect(agent.session.surface.replaceGeneration).toBe(generation + 1)
    expect(agent.session.deriveMessages().at(-1)?.content).toEqual([
      { type: 'text', text: 'later background remains outside the selected range' },
    ])
    expect([...agent.session.readLog().valuesOf(['user/message', 'assistant/message'])].length).toBeGreaterThan(4)

    const after = await ctx.sessionContext.inspect(agent, {}, new AbortController().signal)
    expect(after.preparations.at(-1)).toMatchObject({
      preparationId: prepared.preparationId,
      status: 'committed',
      summarySource: 'human',
      compactionId: committed.compactionId,
    })
  })

  it('keeps the model plan and attempted call visible when summary generation fails', async () => {
    const { ctx } = await harness(['answer', MAX_TOKENS_REPLY])
    const agent = ctx.agentLoop.create(SessionId('failed-range-context'), { provider: 'mock', model: 'mock' })
    prompt(agent, 'context to summarize')
    await agent.whenIdle()
    const before = await ctx.sessionContext.inspect(agent, {}, new AbortController().signal)

    const failed = await ctx.sessionContext.prepare(agent, {
      startUnitId: before.units[0]!.id,
      endUnitId: before.units.at(-1)!.id,
    }, new AbortController().signal)

    expect(failed).toMatchObject({
      status: 'failed',
      attemptedCalls: 1,
      completedCalls: 0,
      chunkCount: 1,
      plan: {
        strategy: 'direct',
        provider: 'mock',
        model: 'mock',
        outputTokenCap: 16_000,
      },
    })
    expect(failed.error).toContain('summarization truncated at the token cap')
    expect([...agent.session.readLog().valuesOf([
      'compaction/preparation/planned',
      'compaction/preparation/attempted',
      'compaction/preparation/failed',
    ])].map(event => event.type)).toEqual([
      'compaction/preparation/planned',
      'compaction/preparation/attempted',
      'compaction/preparation/failed',
    ])
  })

  it('reads and searches nested checkpoint originals with bounded opaque cursors', async () => {
    const { ctx } = await harness()
    const agent = ctx.agentLoop.create(SessionId('nested-checkpoint-history'), { provider: 'mock', model: 'mock' })
    const original = agent.session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: `ORIGINAL_LITERAL ${'large '.repeat(500)}` }],
      source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    const firstId = CompactionId('nested-first')
    const firstStart = agent.session.append('compaction/start', { compactionId: firstId, turn: null })
    const firstSummary = agent.session.append('compaction/summary', {
      compactionId: firstId,
      summary: [{ type: 'text', text: 'first checkpoint' }],
      shadowedRange: { start: original.seq, end: original.seq },
      shadowedSeqs: [original.seq],
      shadowedTokenCount: 1000,
      provider: 'mock',
      model: 'mock',
    })
    const firstCheckpoint = agent.session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'first checkpoint' }],
      source: compactCheckpointSource(firstId),
    }), {
      surfaceOp: { op: 'replace', start: original.seq, end: original.seq },
      sourceEventSeqs: [firstStart.seq, firstSummary.seq, original.seq],
    })
    agent.session.append('compaction/end', { compactionId: firstId, turn: null })
    const later = agent.session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'later literal' }],
      source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    const secondId = CompactionId('nested-second')
    const secondStart = agent.session.append('compaction/start', { compactionId: secondId, turn: null })
    const secondSummary = agent.session.append('compaction/summary', {
      compactionId: secondId,
      summary: [{ type: 'text', text: 'second checkpoint' }],
      shadowedRange: { start: firstCheckpoint.seq, end: later.seq },
      shadowedSeqs: [firstCheckpoint.seq, later.seq],
      shadowedTokenCount: 1000,
      provider: 'mock',
      model: 'mock',
    })
    agent.session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'second checkpoint' }],
      source: compactCheckpointSource(secondId),
    }), {
      surfaceOp: { op: 'replace', start: firstCheckpoint.seq, end: later.seq },
      sourceEventSeqs: [secondStart.seq, secondSummary.seq, firstCheckpoint.seq, later.seq],
    })
    agent.session.append('compaction/end', { compactionId: secondId, turn: null })

    const flat = await ctx.sessionContext.historyRead(agent, {
      checkpointId: secondId,
      recursive: false,
      maxBytes: 4096,
    }, new AbortController().signal)
    expect(flat.entries.map(entry => entry.nestedCheckpointId)).toContain(firstId)
    expect(flat.entries.map(entry => entry.text).join('\n')).not.toContain('ORIGINAL_LITERAL')

    const texts: string[] = []
    let cursor: typeof flat.nextCursor
    do {
      const page = await ctx.sessionContext.historyRead(agent, {
        checkpointId: secondId,
        recursive: true,
        maxBytes: 1024,
        ...cursor === undefined ? {} : { cursor },
      }, new AbortController().signal)
      expect(page.returnedBytes).toBeLessThanOrEqual(1024)
      texts.push(...page.entries.map(entry => entry.text))
      cursor = page.nextCursor
      if (page.complete) break
    } while (cursor !== undefined)
    expect(texts.join('')).toContain('ORIGINAL_LITERAL')

    const searched = await ctx.sessionContext.historySearch(agent, {
      checkpointId: secondId,
      recursive: true,
      query: 'ORIGINAL_LITERAL',
      maxResults: 5,
      maxScanBytes: 8192,
    }, new AbortController().signal)
    expect(searched.matches).toEqual([
      expect.objectContaining({ checkpointId: firstId, seq: original.seq }),
    ])
  })

  it('keeps recall pages grapheme-safe and binds search cursors to one literal query', async () => {
    const { ctx } = await harness()
    const agent = ctx.agentLoop.create(SessionId('unicode-checkpoint-history'), { provider: 'mock', model: 'mock' })
    const family = '👨‍👩‍👧‍👦'
    const original = agent.session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: `${'a'.repeat(900)}${family}NEEDLE${'b'.repeat(900)}NEEDLE` }],
      source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    const checkpointId = CompactionId('unicode-checkpoint')
    const start = agent.session.append('compaction/start', { compactionId: checkpointId, turn: null })
    const summary = agent.session.append('compaction/summary', {
      compactionId: checkpointId,
      summary: [{ type: 'text', text: 'unicode checkpoint' }],
      shadowedRange: { start: original.seq, end: original.seq },
      shadowedSeqs: [original.seq],
      shadowedTokenCount: 1000,
      provider: 'mock',
      model: 'mock',
    })
    agent.session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'unicode checkpoint' }],
      source: compactCheckpointSource(checkpointId),
    }), {
      surfaceOp: { op: 'replace', start: original.seq, end: original.seq },
      sourceEventSeqs: [start.seq, summary.seq, original.seq],
    })
    agent.session.append('compaction/end', { compactionId: checkpointId, turn: null })

    const fragments: string[] = []
    const offsets: number[] = []
    let cursor: Awaited<ReturnType<typeof ctx.sessionContext.historyRead>>['nextCursor']
    do {
      const page = await ctx.sessionContext.historyRead(agent, {
        checkpointId,
        maxBytes: 1024,
        ...cursor === undefined ? {} : { cursor },
      }, new AbortController().signal)
      expect(page.returnedBytes).toBeLessThanOrEqual(1024)
      fragments.push(...page.entries.map(entry => entry.text))
      offsets.push(...page.entries.map(entry => entry.offset))
      cursor = page.nextCursor
      if (page.complete) break
    } while (cursor !== undefined)

    const expected = fragments.join('')
    expect(expected).toContain(`${'a'.repeat(900)}${family}NEEDLE${'b'.repeat(900)}NEEDLE`)
    expect(expected).toMatch(/^<message role="user">/u)
    expect(expected).toMatch(/<text>\n[\s\S]+\n<\/text>\n<\/message>$/u)
    let consumed = 0
    const boundaries = new Set<number>([0])
    for (const segment of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(expected)) {
      boundaries.add(segment.index + segment.segment.length)
    }
    for (const [index, fragment] of fragments.entries()) {
      expect(offsets[index]).toBe(consumed)
      consumed += fragment.length
      expect(boundaries.has(consumed)).toBe(true)
    }

    let clock = 0
    const now = vi.spyOn(performance, 'now').mockImplementation(() => {
      clock += 11
      return clock
    })
    const firstSearch = await ctx.sessionContext.historySearch(agent, {
      checkpointId,
      query: 'needle',
      maxResults: 1,
      maxScanBytes: 1024,
    }, new AbortController().signal).finally(() => { now.mockRestore() })
    expect(firstSearch.matches.map(match => match.offset)).toEqual([expected.indexOf('NEEDLE')])
    const searchCursor = firstSearch.nextCursor
    if (searchCursor === undefined) throw new Error('first search page did not return a continuation cursor')
    await expect(ctx.sessionContext.historySearch(agent, {
      checkpointId,
      query: 'different',
      maxResults: 1,
      maxScanBytes: 1024,
      cursor: searchCursor,
    }, new AbortController().signal)).rejects.toThrow(/cursor does not match/)
    const secondSearch = await ctx.sessionContext.historySearch(agent, {
      checkpointId,
      query: 'needle',
      maxResults: 1,
      maxScanBytes: 1024,
      cursor: searchCursor,
    }, new AbortController().signal)
    expect(secondSearch.matches.map(match => match.offset)).toEqual([expected.lastIndexOf('NEEDLE')])
  })

  it('rejects duplicated durable preparation and checkpoint identities during projection', async () => {
    const { ctx } = await harness()
    const agent = ctx.agentLoop.create(SessionId('duplicate-context-identities'), { provider: 'mock', model: 'mock' })
    const preparationId = CompactionPreparationId('duplicate-preparation')
    const request = {
      preparationId,
      start: 1,
      end: 1,
      shadowedSeqs: [1],
      shadowedDigest: 'digest',
      shadowedTokenCount: 1,
      unitCount: 1,
    }
    agent.session.append('compaction/preparation/requested', request)
    agent.session.append('compaction/preparation/requested', request)
    await expect(ctx.sessionContext.inspect(agent, {}, new AbortController().signal))
      .rejects.toThrow(/requested more than once/)

    const other = ctx.agentLoop.create(SessionId('duplicate-checkpoint-identities'), { provider: 'mock', model: 'mock' })
    const original = other.session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'original' }], source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    const checkpointId = CompactionId('duplicate-checkpoint')
    const summary = {
      compactionId: checkpointId,
      summary: [{ type: 'text' as const, text: 'summary' }],
      shadowedRange: { start: original.seq, end: original.seq },
      shadowedSeqs: [original.seq],
      shadowedTokenCount: 1,
      provider: 'mock',
      model: 'mock',
    }
    other.session.append('compaction/summary', summary)
    other.session.append('compaction/summary', summary)
    await expect(ctx.sessionContext.historyRead(other, {
      checkpointId,
    }, new AbortController().signal)).rejects.toThrow(/duplicate summary records/)
  })
})
