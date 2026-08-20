import { describe, expect, it } from 'vitest'
import type { SessionEvent, StorageRecord } from '@deepseek-ai/dsh-session'
import { PackedSessionLog } from '../src/packed-log.ts'

/** Build one trusted text delta for the private-log unit. */
function delta(seq: number): SessionEvent<'assistant/chunk'> {
  return Object.freeze({
    type: 'assistant/chunk',
    seq,
    time: 1_000 + seq,
    data: Object.freeze({
      turn: 1,
      step: 1,
      chunk: Object.freeze({ type: 'text-delta', index: 0, text: `t${seq}` }),
    }),
  })
}

describe('PackedSessionLog', () => {
  it('retains one record for a long compatible delta run and decodes bounded reads', () => {
    const log = new PackedSessionLog()
    for (let seq = 0; seq < 1_000; seq += 1) log.append(delta(seq))

    expect(log.length).toBe(1_000)
    expect(log.recordCount).toBe(1)
    expect(log.at(999)).toEqual(delta(999))
    expect([...log.values(497, 503)].map(event => event.seq)).toEqual([497, 498, 499, 500, 501, 502])
    expect([...log.reverseValues(497, 503)].map(event => event.seq)).toEqual([502, 501, 500, 499, 498, 497])
    expect([...log.valuesOf(['assistant/chunk'], 998, 1_000)].map(event => event.seq)).toEqual([998, 999])
    expect([...log.chunkRuns(497, 503)]).toEqual([{ from: 497, to: 503, turn: 1, step: 1 }])
  })

  it('indexes interleaved event types as ordered logical spans', () => {
    const log = new PackedSessionLog()
    const events: SessionEvent[] = [
      { type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } },
      delta(1),
      delta(2),
      delta(3),
      { type: 'step/end', seq: 4, time: 5, data: { turn: 1, step: 1 } },
      { type: 'turn/end', seq: 5, time: 6, data: { turn: 1, reason: { kind: 'completed' } } },
    ]
    for (const event of events) log.append(Object.freeze(event))

    expect(log.recordCount).toBe(4)
    expect([...log.valuesOf(['turn/end', 'turn/start', 'step/end'])].map(event => event.seq))
      .toEqual([0, 4, 5])
    expect([...log.reverseValuesOf(['turn/end', 'turn/start', 'step/end'])].map(event => event.seq))
      .toEqual([5, 4, 0])
    expect([...log.reverseValuesOf(['assistant/chunk'], 2, 4)].map(event => event.seq))
      .toEqual([3, 2])
  })

  it('adopts a sealed packed row and starts a separate mutable live tail', () => {
    const row: StorageRecord = {
      type: 'text-chunks',
      seq0: 0,
      time0: 1_000,
      data: { turn: 1, step: 1, index: 0, dt: [1, 1], texts: ['t0', 't1', 't2'] },
    }
    Object.freeze(row.data.dt)
    Object.freeze(row.data.texts)
    Object.freeze(row.data)
    Object.freeze(row)
    const log = new PackedSessionLog()

    log.adopt(row)
    log.append(delta(3))
    log.append(delta(4))
    log.append(delta(5))

    expect(row.data.texts).toEqual(['t0', 't1', 't2'])
    expect(log.recordCount).toBe(2)
    expect([...log.values(0, 6)].map(event => event.seq)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('coalesces compatible restored rows across physical write batches', () => {
    const first: StorageRecord = {
      type: 'text-chunks',
      seq0: 0,
      time0: 10,
      data: { turn: 1, step: 1, index: 0, dt: [1], texts: ['a', 'b'] },
    }
    const second: StorageRecord = {
      type: 'text-chunks',
      seq0: 2,
      time0: 13,
      data: { turn: 1, step: 1, index: 0, dt: [2], texts: ['c', 'd'] },
    }
    const log = new PackedSessionLog()

    log.adopt(first)
    log.adopt(second)
    log.sealAdoptedTail()

    expect(log.recordCount).toBe(1)
    expect([...log.values(0, 4)].map(event => [event.seq, event.time])).toEqual([
      [0, 10], [1, 11], [2, 13], [3, 15],
    ])
  })
})
