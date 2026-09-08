/**
 * ui-workbench plugin halves: the inert node entry, the browser entry's
 * service/occupant/toggle registrations against the real SlotRegistry (with
 * fiber teardown proving removal — HMR safety), the panel-tab projection, and
 * the invariant companion's ownership reservation.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'
import { WorkbenchController } from '../src/client/service.ts'
import { apply as applyNode } from '../src/index.ts'
import * as WorkbenchInvariant from '../src/invariant.ts'
import { en, NS, zh } from '../src/client/locales.ts'
import type { WorkbenchPanelTab } from '../src/client/contract/slots.ts'

/** Header utilities entry ids currently registered. */
function headerEntryIds(ctx: Context): (string | undefined)[] {
  return ctx.slots.entries('conversation.session.header.utilities').map(entry => entry.options.id)
}

/** The layout face the workbench delegates to; recorded so transitions are assertable. */
function fakeLayout() {
  return { openWorkbench: vi.fn(), closeWorkbench: vi.fn(), toggleWorkbench: vi.fn() }
}

/**
 * Invoke the shell entry's inject factory the way the render machinery does,
 * so the controller is wired and the panel observable is reachable.
 * @param ctx - booted context whose workbench entry was registered.
 * @returns the panel observable and the bound actions the factory received.
 */
function wireShell(ctx: Context): {
  panels: { getSnapshot(): readonly WorkbenchPanelTab[] }
  actions: { select: ReturnType<typeof vi.fn>; clear: ReturnType<typeof vi.fn> }
} {
  const entry = ctx.slots.entries('workbench')[0]!
  const actions = { select: vi.fn(), clear: vi.fn() }
  const injectFactory = entry.inject as (bound: typeof actions) => {
    hooks: { panels: { getSnapshot(): readonly WorkbenchPanelTab[] } }
  }
  return { panels: injectFactory(actions).hooks.panels, actions }
}

/** Boot the browser half over a real slot tree that declares the workbench column. */
async function bench(layout = fakeLayout()) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'workbench': { kind: 'single', scope: 'root' },
      'conversation.session.header.utilities': { kind: 'list', scope: 'session' },
    },
  } as never, () => null)
  ctx.provide('layout', layout as never)
  // The locale plugin binds a settings scope, which reads the connection handle
  // and the forwarded-event port.
  ctx.provide('connection', { api: { settings: {} }, isLoopback: false } as never)
  ctx.provide('remote', { $on: () => () => {} } as never)
  ctx.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, fiber, layout }
}

describe('ui-workbench browser half', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['slots', 'locale', 'layout'])
  })

  it('occupies the workbench column and declares the panel seat', async () => {
    const { ctx, fiber } = await bench()
    expect(ctx.slots.entries('workbench')).toHaveLength(1)
    expect(ctx.slots.spec('workbench.panel')).toEqual({ kind: 'list', scope: 'root' })
    await fiber.dispose()
    expect(ctx.slots.entries('workbench')).toHaveLength(0)
  })

  it('registers the header toggle, and fiber teardown removes it (HMR safety)', async () => {
    const { ctx, fiber } = await bench()
    expect(headerEntryIds(ctx)).toContain('workbench-toggle')
    await fiber.dispose()
    expect(headerEntryIds(ctx)).not.toContain('workbench-toggle')
  })

  it('registers both dictionaries under its own namespace and releases them with the fiber', async () => {
    const { ctx, fiber } = await bench()
    const translate = ctx.locale.bind(NS)
    expect(translate('title')).toBe(zh.title)
    ctx.locale.setLocale('en')
    expect(translate('title')).toBe(en.title)

    // Withdrawn dictionaries leave the key unresolved rather than translated.
    await fiber.dispose()
    expect(translate('title')).not.toBe(en.title)
  })

  it('keeps the English dictionary key-identical to the Chinese source of truth', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })

  it('projects panel registrations into the tab list, ordered and live', async () => {
    const { ctx } = await bench()
    const { panels } = wireShell(ctx)
    expect(panels.getSnapshot()).toEqual([])
    ctx.slots.inject('workbench.panel', () => ctx.slots.register({
      name: 'workbench.panel',
      id: 'terminal',
      order: 20,
      label: () => '终端',
    }, () => null))
    ctx.slots.inject('workbench.panel', () => ctx.slots.register({
      name: 'workbench.panel',
      id: 'files',
      order: 10,
      label: () => '文件',
    }, () => null))
    // Registration notifications are microtask-batched, like the other mirrors.
    await Promise.resolve()
    expect(panels.getSnapshot()).toEqual([
      { id: 'files', label: '文件', order: 10 },
      { id: 'terminal', label: '终端', order: 20 },
    ])
  })
})

describe('WorkbenchController', () => {
  it('open selects a panel then opens the column; open without an id keeps the selection', async () => {
    const { ctx, layout } = await bench()
    const { actions } = wireShell(ctx)
    ctx.workbench.open('files')
    expect(actions.select).toHaveBeenCalledWith('files')
    expect(layout.openWorkbench).toHaveBeenCalledTimes(1)
    ctx.workbench.open()
    expect(actions.select).toHaveBeenCalledTimes(1)
    expect(layout.openWorkbench).toHaveBeenCalledTimes(2)
  })

  it('close and toggle delegate to the layout face', async () => {
    const { ctx, layout } = await bench()
    ctx.workbench.close()
    ctx.workbench.toggle()
    expect(layout.closeWorkbench).toHaveBeenCalledTimes(1)
    expect(layout.toggleWorkbench).toHaveBeenCalledTimes(1)
  })

  it('fails loud before the shell entry wired its actions', () => {
    const controller = new WorkbenchController(fakeLayout())
    expect(() => { controller.open('files') }).toThrow(/panel actions not wired/)
  })
})

describe('ui-workbench node half', () => {
  it('contributes no host behavior and has no default export', async () => {
    // The node half exists only so the plugin appears in the Loader tree.
    expect(() => { applyNode() }).not.toThrow()
    const module = await import('../src/index.ts')
    expect('default' in module).toBe(false)
  })
})

describe('ui-workbench invariant companion', () => {
  it('reserves package ownership under its declared companion name', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    const fiber = ctx.plugin(WorkbenchInvariant)
    await fiber.await()
    expect(WorkbenchInvariant.name).toBe('client-ui-workbench-invariant')
    expect(WorkbenchInvariant.inject).toEqual(['invariants'])
    // Emitting an unrelated event proves the companion installed no audit.
    expect(() => { (ctx.emit as (event: string) => void)('slots/changed') }).not.toThrow()
    await fiber.dispose()
  })
})
