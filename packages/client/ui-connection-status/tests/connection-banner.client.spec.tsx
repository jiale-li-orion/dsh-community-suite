// @vitest-environment jsdom
/**
 * ui-connection-status: the browser half's overlay registration against the
 * real SlotRegistry (with fiber teardown proving removal — HMR safety), the
 * dictionaries it owns, and the banner's rendering for each published phase.
 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { makeTranslate, stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import { ConnectionBanner, type ConnectionBannerProps } from '../src/client/ConnectionBanner.tsx'
import { apply, inject } from '../src/client/index.ts'
import { apply as applyNode } from '../src/index.ts'
import * as Invariant from '../src/invariant.ts'
import { en, NS, zh } from '../src/client/locales.ts'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'

afterEach(cleanup)

/** Overlay entry ids currently registered in the frame-wide list. */
function overlayEntryIds(ctx: Context): (string | undefined)[] {
  return ctx.slots.entries('shell.overlay').map(entry => entry.options.id)
}

/** Boot the browser half over a real slot tree that declares the overlay list. */
async function bench(): Promise<{ ctx: Context; fiber: ReturnType<Context['plugin']> }> {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'shell.overlay': { kind: 'list', scope: 'root' },
    },
  } as never, () => null)
  ctx.provide('connection', { connectionState: { getSnapshot: () => undefined, subscribe: () => () => {} } } as never)
  // The locale plugin binds a settings scope, which reads the connection handle
  // and the forwarded-event port.
  ctx.provide('remote', { $on: () => () => {} } as never)
  ctx.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, fiber }
}

/** Component props over the four shares, with the phase supplied directly. */
function props(phase: 'connected' | 'reconnecting' | undefined): ConnectionBannerProps {
  return {
    useConnectionState: () => phase,
    t: makeTranslate(zh),
  } as unknown as ConnectionBannerProps
}

describe('ui-connection-status browser half', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['connection', 'slots', 'locale'])
  })

  it('registers the banner, and fiber teardown removes it (HMR safety)', async () => {
    const { ctx, fiber } = await bench()
    expect(overlayEntryIds(ctx)).toContain('connection-status')
    await fiber.dispose()
    expect(overlayEntryIds(ctx)).not.toContain('connection-status')
  })

  it('registers both dictionaries under its own namespace and releases them with the fiber', async () => {
    const { ctx, fiber } = await bench()
    const translate = ctx.locale.bind(NS)
    // The active locale follows the browser, so pin both sides explicitly.
    ctx.locale.setLocale('zh')
    expect(translate('reconnecting')).toBe(zh['reconnecting'])
    ctx.locale.setLocale('en')
    expect(translate('reconnecting')).toBe(en['reconnecting'])
    await fiber.dispose()
    expect(translate('reconnecting')).not.toBe(en['reconnecting'])
  })

  it('keeps the English dictionary key-identical to the Chinese source of truth', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })

  it('leaves the host half inert', () => {
    // The node half exists only so the plugin appears in the Loader tree.
    expect(applyNode).not.toThrow()
  })

  it('reserves package ownership through the invariant companion', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true }).await()
    const fiber = ctx.plugin(Invariant)
    await fiber.await()
    expect(Invariant.name).toBe('client-ui-connection-status-invariant')
    expect(Invariant.inject).toEqual(['invariants'])
    // Emitting an unrelated event proves the companion installed no audit.
    expect(() => { (ctx.emit as (event: string) => void)('slots/changed') }).not.toThrow()
    await fiber.dispose()
  })
})

describe('ConnectionBanner', () => {
  it('renders nothing while the connection is healthy or the loop has not started', () => {
    const { container } = render(<ConnectionBanner {...props('connected')} />)
    expect(container.textContent).toBe('')
    cleanup()
    const before = render(<ConnectionBanner {...props(undefined)} />)
    expect(before.container.textContent).toBe('')
  })

  it('reports a lost connection with the localized status text', () => {
    render(<ConnectionBanner {...props('reconnecting')} />)
    expect(screen.getByRole('status').textContent).toBe(zh['reconnecting'])
  })
})
