/**
 * Pre-step wiring: the class is stated once per turn, at the step that opens it,
 * and a turn that declares nothing is left exactly as the chain decided.
 */
import { describe, expect, it, vi } from 'vitest'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { apply, inject, name } from '../src/index.ts'
import * as OriginInvariant from '../src/invariant.ts'

/** Capture the registered pre-step handler without standing up the registry. */
function handlerOf(): (input: {
  agent: unknown
  turn: number
  step: number
  signal: { aborted: boolean }
}, next: () => Promise<unknown>) => Promise<unknown> {
  let captured: unknown
  const ctx = { on: (event: string, handler: unknown) => { captured = handler; void event } }
  apply(ctx as never)
  return captured as ReturnType<typeof handlerOf>
}

/**
 * A session log holding one turn/start and one declaring prompt.
 * @param device - the class its prompt declares, when any.
 * @param withTurnStart - whether the log holds the opening turn/start event.
 */
function fakeAgent(device?: string, withTurnStart = true, openedTurn = 1) {
  const prompt = {
    source: device === undefined
      ? { kind: 'user', rpcId: 'rpc' }
      : { kind: 'user', rpcId: 'rpc', clientDevice: device },
  }
  const log = {
    reverseValuesOf: () => withTurnStart ? [{ seq: 5, data: { turn: openedTurn } }] : [],
    valuesOf: () => [{ data: prompt }],
  }
  return { session: { readLog: () => log } }
}

type Decision = { kind: string; messages?: readonly { content: readonly { text: string }[] }[] }

/** Run the registered handler over one decision, exactly as the chain would. */
async function decideWith(
  step: number,
  decision: Decision,
  device?: string,
  withTurnStart = true,
  openedTurn = 1,
): Promise<Decision> {
  const handler = handlerOf()
  return await handler(
    { agent: fakeAgent(device, withTurnStart, openedTurn), turn: 1, step, signal: { aborted: false } },
    () => Promise.resolve(decision),
  ) as Decision
}

describe('client-origin pre-step', () => {
  it('declares its name and the registry it needs', () => {
    expect(name).toBe('client-origin')
    expect(inject).toEqual(['agents'])
  })

  it('states the class once, at the step that opens the turn', async () => {
    const decided: Decision = { kind: 'enter', messages: [] }
    const result = await decideWith(1, decided, 'mobile-app')
    expect(result.messages).toHaveLength(1)
    expect(result.messages?.[0]?.content[0]?.text).toContain('mobile-app')
  })

  it('leaves later steps alone: the class cannot change inside its turn', async () => {
    const decided: Decision = { kind: 'enter', messages: [] }
    // Identity, not equality: the chain's own decision is handed back untouched.
    expect(await decideWith(2, decided, 'mobile-app')).toBe(decided)
  })

  it('reads only the messages this step proposes when the log holds no opening turn', async () => {
    const decided: Decision = { kind: 'enter', messages: [] }
    expect(await decideWith(1, decided, undefined, false)).toBe(decided)
  })

  it('stops at the opening turn and ignores a turn/start for another turn', async () => {
    // The class belongs to the prepared turn: an earlier turn's opening event
    // must not decide which messages are read.
    const decided: Decision = { kind: 'enter', messages: [] }
    expect(await decideWith(1, decided, 'mobile-app', true, 7)).toBe(decided)
  })

  it('leaves a turn that declares nothing exactly as the chain decided', async () => {
    const decided: Decision = { kind: 'enter', messages: [] }
    expect(await decideWith(1, decided)).toBe(decided)
  })

  it('never injects into a rejected step', async () => {
    const handler = handlerOf()
    const result = await handler(
      { agent: fakeAgent('mobile-app'), turn: 1, step: 1, signal: { aborted: false } },
      () => Promise.resolve({ kind: 'reject' }),
    )
    expect(result).toEqual({ kind: 'reject' })
  })

  it('never injects into an aborted step', async () => {
    const handler = handlerOf()
    const result = await handler(
      { agent: fakeAgent('mobile-app'), turn: 1, step: 1, signal: { aborted: true } },
      () => Promise.resolve({ kind: 'enter', messages: [] }),
    )
    expect(result).toEqual({ kind: 'enter', messages: [] })
  })

  it('keeps the messages the chain already decided to send', async () => {
    const kept = createUserMessage({
      content: [{ type: 'text', text: 'existing' }],
      source: { kind: 'plugin', plugin: 'test', form: 'snapshot', sections: [] },
    })
    const result = await decideWith(1, { kind: 'enter', messages: [kept] }, 'mobile-app')
    expect(result.messages?.[0]).toBe(kept)
    expect(result.messages).toHaveLength(2)
  })

  it('registers itself as the first pre-step listener', () => {
    const on = vi.fn()
    apply({ on } as never)
    expect(on).toHaveBeenCalledWith('agent/pre-step', expect.any(Function), { prepend: true })
  })
})

describe('client-origin invariant companion', () => {
  it('declares its companion identity and explained empty invariant', () => {
    expect(OriginInvariant.name).toBe('client-origin-invariant')
    expect(OriginInvariant.inject).toEqual(['invariants'])
  })
})
