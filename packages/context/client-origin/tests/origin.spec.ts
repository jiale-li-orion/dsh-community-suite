/**
 * Client-origin derivation: which class one open turn declares, and what the
 * model is told about it.
 */
import { describe, expect, it } from 'vitest'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { deriveClientOriginContext, renderClientOriginContext } from '../src/origin.ts'

/** One ordinary user-rpc message declaring the given class, when any. */
function prompt(device?: unknown): UserMessage {
  const source = device === undefined
    ? { kind: 'user' as const, rpcId: 'rpc' as never }
    : { kind: 'user' as const, rpcId: 'rpc' as never, clientDevice: device as never }
  return createUserMessage({ content: [{ type: 'text', text: 'hi' }], source })
}

describe('deriveClientOriginContext', () => {
  it('resolves the class a turn declares', () => {
    expect(deriveClientOriginContext([prompt('mobile-app')]))
      .toEqual({ kind: 'resolved', device: 'mobile-app' })
  })

  it('reports disagreement rather than the last writer', () => {
    expect(deriveClientOriginContext([prompt('mobile-app'), prompt('desktop-browser')]))
      .toEqual({ kind: 'mixed', devices: ['mobile-app', 'desktop-browser'] })
  })

  it('ignores repeated declarations of one class', () => {
    expect(deriveClientOriginContext([prompt('mobile-browser'), prompt('mobile-browser')]))
      .toEqual({ kind: 'resolved', device: 'mobile-browser' })
  })

  it('reports nothing when no message declares a class', () => {
    expect(deriveClientOriginContext([prompt()])).toEqual({ kind: 'missing' })
    expect(deriveClientOriginContext([])).toEqual({ kind: 'missing' })
  })

  it('ignores a message that did not come from a client prompt', () => {
    const injected = createUserMessage({
      content: [{ type: 'text', text: 'injected' }],
      source: { kind: 'plugin', plugin: 'test', form: 'snapshot', sections: [] },
    })
    expect(deriveClientOriginContext([injected])).toEqual({ kind: 'missing' })
  })

  it('refuses a class outside the closed set', () => {
    // A producer that invents a bucket would otherwise reach the model unread.
    expect(() => deriveClientOriginContext([prompt('tablet')])).toThrow(TypeError)
    expect(() => deriveClientOriginContext([prompt(7)])).toThrow(TypeError)
  })
})

describe('renderClientOriginContext', () => {
  it('states the class and what follows from it', () => {
    expect(renderClientOriginContext({ kind: 'resolved', device: 'mobile-app' }))
      .toContain('mobile-app')
  })

  it('names every class when a turn disagrees', () => {
    const text = renderClientOriginContext({ kind: 'mixed', devices: ['mobile-app', 'desktop-browser'] })
    expect(text).toContain('mobile-app')
    expect(text).toContain('desktop-browser')
  })

  it('says so when the class is unknown instead of guessing one', () => {
    expect(renderClientOriginContext({ kind: 'missing' })).toContain('unavailable')
  })
})
