import { describe, expect, it, vi } from 'vitest'
import type { SessionFace, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { conversationSnapshot } from '@deepseek-ai/dsh-client-test-runtime'
import { ContextHistoryCursor, ContextUnitId } from '@deepseek-ai/dsh-session-context/brand'
import type { ContextPreparation, ContextSnapshot } from '@deepseek-ai/dsh-session-context/types'
import { SessionContextController } from '../src/client/controller.ts'
import type { SessionContextRemote } from '../src/client/controller.ts'

const SID = 'context-controller' as SessionId

function context(revision = 0): ContextSnapshot {
  return {
    sessionId: SID,
    logRevision: revision,
    replaceGeneration: revision,
    generationSeq: revision === 0 ? null : revision,
    tailSeq: 3,
    totalTokens: 20,
    surfaceTokens: 16,
    unitCount: 1,
    unitOffset: 0,
    hasEarlierUnits: false,
    units: [{
      id: ContextUnitId('unit-1'),
      startSeq: 1,
      endSeq: 1,
      kind: 'message',
      role: 'user',
      tokenCount: 8,
      preview: 'hello',
      time: 1,
      balanced: true,
      editable: true,
    }],
    preparations: [],
  }
}

function sessionFace() {
  let snapshot = conversationSnapshot(SID)
  const listeners = new Set<() => void>()
  return {
    session: {
      getSnapshot: () => snapshot,
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    } as SessionFace,
    pushSurface(revision: number | null) {
      snapshot = { ...snapshot, surfaceRevision: revision }
      for (const listener of listeners) listener()
    },
    notifyOnly() {
      snapshot = { ...snapshot, running: !snapshot.running }
      for (const listener of listeners) listener()
    },
  }
}

function remote(): SessionContextRemote {
  return {
    inspect: vi.fn<SessionContextRemote['inspect']>(async () => ({ ok: true, value: context(1) })),
    readUnit: vi.fn<SessionContextRemote['readUnit']>(async () => ({
      ok: true,
      value: { unit: context().units[0]!, messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }] },
    })),
    rewrite: vi.fn<SessionContextRemote['rewrite']>(async () => ({
      ok: true,
      value: { rewriteId: 'rewrite' as never, replacementSeq: 4, previousGenerationSeq: null, shadowedItemCount: 1, shadowedTokenCount: 8 },
    })),
    prepare: vi.fn<SessionContextRemote['prepare']>(async () => ({
      ok: true,
      value: {
        preparationId: 'prep' as never,
        status: 'ready',
        startSeq: 1,
        endSeq: 1,
        unitCount: 1,
        shadowedTokenCount: 8,
        summary: 'summary',
        summarySource: 'generated',
        attemptedCalls: 1,
        completedCalls: 1,
        chunkCount: 1,
        createdAt: 1,
      },
    })),
    editPreparation: vi.fn<SessionContextRemote['editPreparation']>(async (_id, request) => ({
      ok: true,
      value: {
        preparationId: request.preparationId,
        status: 'ready',
        startSeq: 1,
        endSeq: 1,
        unitCount: 1,
        shadowedTokenCount: 8,
        summary: request.text,
        summarySource: request.source,
        attemptedCalls: 1,
        completedCalls: 1,
        chunkCount: 1,
        createdAt: 1,
      },
    })),
    discardPreparation: vi.fn<SessionContextRemote['discardPreparation']>(async () => ({ ok: true, value: { discarded: true } })),
    commitPreparation: vi.fn<SessionContextRemote['commitPreparation']>(async () => ({
      ok: true,
      value: {
        compactionId: 'compact' as never,
        startSeq: 4,
        summarySeq: 5,
        endSeq: 7,
        summary: [{ type: 'text', text: 'summary' }],
        shadowedRange: { start: 1, end: 1 },
        shadowedSeqs: [1],
        shadowedTokenCount: 8,
      },
    })),
    historyRead: vi.fn<SessionContextRemote['historyRead']>(async () => ({
      ok: true,
      value: { entries: [], complete: true, returnedBytes: 50 },
    })),
    historySearch: vi.fn<SessionContextRemote['historySearch']>(async () => ({
      ok: true,
      value: { matches: [], complete: true, scannedBytes: 20 },
    })),
  }
}

describe('SessionContextController', () => {
  it('refreshes only while active and only when the Session surface revision changes', async () => {
    const face = sessionFace()
    const api = remote()
    const controller = new SessionContextController(api, SID, face.session)
    const release = controller.activate()
    await vi.waitFor(() => { expect(api.inspect).toHaveBeenCalledOnce() })
    expect(controller.getSnapshot().status).toBe('ready')

    face.notifyOnly()
    await Promise.resolve()
    expect(api.inspect).toHaveBeenCalledOnce()

    face.pushSurface(2)
    await vi.waitFor(() => { expect(api.inspect).toHaveBeenCalledTimes(2) })
    release()
    face.pushSurface(3)
    await Promise.resolve()
    expect(api.inspect).toHaveBeenCalledTimes(2)
  })

  it('refreshes non-surface preparation progress while a preparation operation is active', async () => {
    const face = sessionFace()
    const api = remote()
    let settle!: (result: { ok: true; value: ContextPreparation }) => void
    vi.mocked(api.prepare).mockImplementation(() => new Promise((resolve) => { settle = resolve }))
    const controller = new SessionContextController(api, SID, face.session)
    const release = controller.activate()
    await vi.waitFor(() => { expect(api.inspect).toHaveBeenCalledOnce() })

    const pending = controller.prepare({
      startUnitId: ContextUnitId('unit-1'),
      endUnitId: ContextUnitId('unit-1'),
    })
    await vi.waitFor(() => { expect(controller.getSnapshot().preparationOperation).toBe('prepare') })
    face.notifyOnly()
    await vi.waitFor(() => { expect(api.inspect).toHaveBeenCalledTimes(2) })
    settle({
      ok: true,
      value: {
        preparationId: 'prep' as never,
        status: 'ready',
        startSeq: 1,
        endSeq: 1,
        unitCount: 1,
        shadowedTokenCount: 8,
        summary: 'summary',
        summarySource: 'generated',
        attemptedCalls: 1,
        completedCalls: 1,
        chunkCount: 1,
        createdAt: 1,
      },
    })
    await expect(pending).resolves.toMatchObject({ ok: true })
    release()
  })

  it('caches unit reads and routes rewrite, preparation, commit, and recall through one view', async () => {
    const face = sessionFace()
    const api = remote()
    const controller = new SessionContextController(api, SID, face.session)
    const release = controller.activate()
    await vi.waitFor(() => { expect(controller.getSnapshot().status).toBe('ready') })

    await controller.readUnit(ContextUnitId('unit-1'))
    await controller.readUnit(ContextUnitId('unit-1'))
    expect(api.readUnit).toHaveBeenCalledOnce()
    expect(controller.getSnapshot().details.get(ContextUnitId('unit-1'))?.messages).toHaveLength(1)

    await expect(controller.rewrite({ unitId: ContextUnitId('unit-1'), text: 'edited', mode: 'patch', continue: false }))
      .resolves.toMatchObject({ ok: true })
    await expect(controller.prepare({ startUnitId: ContextUnitId('unit-1'), endUnitId: ContextUnitId('unit-1') }))
      .resolves.toMatchObject({ ok: true })
    await expect(controller.editPreparation({ preparationId: 'prep' as never, text: 'edited summary', source: 'human' }))
      .resolves.toMatchObject({ ok: true })
    await expect(controller.commitPreparation({ preparationId: 'prep' as never }))
      .resolves.toMatchObject({ ok: true })
    await expect(controller.readHistory('compact' as never)).resolves.toMatchObject({ ok: true })
    await expect(controller.searchHistory('compact' as never, 'needle')).resolves.toMatchObject({ ok: true })

    expect(api.rewrite).toHaveBeenCalledOnce()
    expect(api.prepare).toHaveBeenCalledOnce()
    expect(api.editPreparation).toHaveBeenCalledOnce()
    expect(api.commitPreparation).toHaveBeenCalledOnce()
    expect(api.historyRead).toHaveBeenCalledOnce()
    expect(api.historySearch).toHaveBeenCalledOnce()
    release()
    controller.dispose()
  })

  it('prepends an earlier unit page only while the stable surface identity matches', async () => {
    const face = sessionFace()
    const api = remote()
    const tail = {
      ...context(2),
      unitCount: 2,
      unitOffset: 1,
      hasEarlierUnits: true,
      units: [{ ...context().units[0]!, id: ContextUnitId('unit-2'), startSeq: 2, endSeq: 2, preview: 'tail' }],
    }
    const older = {
      ...tail,
      unitOffset: 0,
      hasEarlierUnits: false,
      units: [{ ...context().units[0]!, id: ContextUnitId('unit-1'), preview: 'older' }],
    }
    vi.mocked(api.inspect)
      .mockResolvedValueOnce({ ok: true, value: tail })
      .mockResolvedValueOnce({ ok: true, value: older })
    const controller = new SessionContextController(api, SID, face.session)
    const release = controller.activate()
    await vi.waitFor(() => { expect(controller.getSnapshot().context?.unitOffset).toBe(1) })
    const result = await controller.loadEarlier()
    expect(result).toMatchObject({ ok: true })
    expect(controller.getSnapshot().context).toMatchObject({
      unitOffset: 0,
      hasEarlierUnits: false,
    })
    expect(controller.getSnapshot().context?.units.map(unit => unit.preview)).toEqual(['older', 'tail'])
    release()
  })

  it('refreshes the tail instead of installing an older page from a changed surface', async () => {
    const face = sessionFace()
    const api = remote()
    const tail = {
      ...context(2),
      unitCount: 2,
      unitOffset: 1,
      hasEarlierUnits: true,
      units: [{ ...context().units[0]!, id: ContextUnitId('tail-unit'), preview: 'tail' }],
    }
    const stalePage = {
      ...tail,
      replaceGeneration: 3,
      tailSeq: 9,
      unitOffset: 0,
      units: [{ ...context().units[0]!, id: ContextUnitId('stale-unit'), preview: 'stale older page' }],
    }
    const refreshed = {
      ...stalePage,
      unitOffset: 1,
      units: [{ ...context().units[0]!, id: ContextUnitId('fresh-tail'), preview: 'fresh tail' }],
    }
    vi.mocked(api.inspect)
      .mockResolvedValueOnce({ ok: true, value: tail })
      .mockResolvedValueOnce({ ok: true, value: stalePage })
      .mockResolvedValueOnce({ ok: true, value: refreshed })
    const controller = new SessionContextController(api, SID, face.session)
    const release = controller.activate()
    await vi.waitFor(() => { expect(controller.getSnapshot().context?.unitOffset).toBe(1) })

    await expect(controller.loadEarlier()).resolves.toMatchObject({ ok: true, value: refreshed })
    expect(controller.getSnapshot().context?.units.map(unit => unit.preview)).toEqual(['fresh tail'])
    expect(api.inspect).toHaveBeenCalledTimes(3)
    release()
  })

  it('coalesces original fragments and continues one query-bound search', async () => {
    const face = sessionFace()
    const api = remote()
    vi.mocked(api.historyRead).mockResolvedValue({
      ok: true,
      value: {
        entries: [
          { checkpointId: 'compact' as never, seq: 1, role: 'user', offset: 0, text: 'first ', complete: false },
          { checkpointId: 'compact' as never, seq: 1, role: 'user', offset: 6, text: 'second', complete: true },
        ],
        complete: true,
        returnedBytes: 100,
      },
    })
    vi.mocked(api.historySearch)
      .mockResolvedValueOnce({
        ok: true,
        value: {
          matches: [{ checkpointId: 'compact' as never, seq: 1, offset: 0, snippet: 'first' }],
          nextCursor: ContextHistoryCursor('next'),
          complete: false,
          scannedBytes: 100,
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: {
          matches: [{ checkpointId: 'compact' as never, seq: 1, offset: 10, snippet: 'second' }],
          complete: true,
          scannedBytes: 80,
        },
      })
    const controller = new SessionContextController(api, SID, face.session)

    await controller.readHistory('compact' as never)
    expect(controller.getSnapshot().histories.get('compact' as never)?.entries).toEqual([
      expect.objectContaining({ offset: 0, text: 'first second', complete: true }),
    ])
    await controller.searchHistory('compact' as never, 'needle')
    await controller.searchHistory('compact' as never, 'needle', true)
    expect(controller.getSnapshot().searches.get('compact' as never)?.matches.map(match => match.offset)).toEqual([0, 10])
    expect(api.historySearch).toHaveBeenLastCalledWith(
      SID,
      expect.objectContaining({ query: 'needle', cursor: ContextHistoryCursor('next') }),
      expect.any(AbortSignal),
    )
  })
})
