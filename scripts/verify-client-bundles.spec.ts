/**
 * The client-bundle module-table gate rejects exactly the failures that take
 * the browser to "Failed to load plugins": an undeclared external that the
 * module table cannot answer, a bundle registering under the wrong id, and a
 * registration envelope that throws.
 */
import { describe, expect, it } from 'vitest'
import { checkBundles } from './verify-client-bundles.ts'
import type { ClientBundle } from './verify-client-bundles.ts'

/** One synthetic bundle whose factory requires the given specifiers. */
function bundle(id: string, requires: readonly string[], registeredId = id): ClientBundle {
  const body = requires.map(spec => `require(${JSON.stringify(spec)});`).join('\n')
  return {
    id,
    path: `packages/x/${id}/lib/client.js`,
    source: `window.__ModuleLoader__.load({ id: ${JSON.stringify(registeredId)}, factory: (require) => {\n${body}\n} });`,
  }
}

const TABLE = new Set(['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-slots', '@deepseek-ai/dsh-client-runtime', '@deepseek-ai/dsh-plugin-catalog-awesome'])

describe('checkBundles', () => {
  it('accepts a bundle that registers its own id and requires only table words', () => {
    expect(checkBundles([bundle('@deepseek-ai/dsh-client-ui-workbench', ['react', '@deepseek-ai/dsh-client-ui-slots'])], TABLE))
      .toEqual([])
  })

  it('accepts a registered plugin required through its /client channel', () => {
    expect(checkBundles([bundle('@deepseek-ai/dsh-client-ui-workbench', ['@deepseek-ai/dsh-client-runtime/client'])], TABLE))
      .toEqual([])
  })

  it('rejects an undeclared external the module table cannot answer', () => {
    const violations = checkBundles([bundle('@deepseek-ai/dsh-api-remotes', ['zod'])], TABLE)
    expect(violations).toHaveLength(1)
    expect(violations[0]?.message).toMatch(/require\("zod"\).*cannot answer it/)
  })

  it('rejects a bundle that registers under another id', () => {
    const violations = checkBundles([bundle('@deepseek-ai/dsh-client-ui-workbench', [], 'wrong-id')], TABLE)
    expect(violations).toHaveLength(1)
    expect(violations[0]?.message).toMatch(/registers id "wrong-id"/)
  })

  it('rejects an envelope that throws and a bundle with no registration', () => {
    const throwing: ClientBundle = { id: 'a', path: 'packages/x/a/lib/client.js', source: 'throw new Error("boom")' }
    const silent: ClientBundle = { id: 'b', path: 'packages/x/b/lib/client.js', source: 'window.__ModuleLoader__ = {}' }
    const violations = checkBundles([throwing, silent], TABLE)
    expect(violations.map(violation => violation.message)).toEqual([
      expect.stringMatching(/envelope threw: Error: boom/),
      expect.stringMatching(/registered 0 handoffs/),
    ])
  })
})
