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
import type { WorkbenchFileRef, WorkbenchPanelTab } from '../src/client/contract/slots.ts'
import type { WorkbenchView } from '@deepseek-ai/dsh-workbench/types'

/** The catalog entry the fake remote namespaces serve. */
const CATALOG_ENTRY = {
  name: 'dsh-example',
  owner: 'example',
  url: 'https://github.com/example/dsh-example',
  category: 'tools',
  description: 'An example plugin.',
  npm: null,
  version: null,
  stars: 1,
  downloads: null,
  install: 'dsh plugin --profile web add github:example/dsh-example',
  added: '2026-09-01',
}

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
  injected: { toggle: () => void; closeFile: () => void }
  actions: {
    select: ReturnType<typeof vi.fn>
    clear: ReturnType<typeof vi.fn>
    preview: ReturnType<typeof vi.fn>
    closeFile: ReturnType<typeof vi.fn>
  }
} {
  const entry = ctx.slots.entries('workbench')[0]!
  const actions = { select: vi.fn(), clear: vi.fn(), preview: vi.fn(), closeFile: vi.fn() }
  const injectFactory = entry.inject as (bound: typeof actions) => {
    hooks: { panels: { getSnapshot(): readonly WorkbenchPanelTab[] } }
    toggle: () => void
    closeFile: () => void
  }
  const injected = injectFactory(actions)
  return { panels: injected.hooks.panels, injected, actions }
}

/**
 * Read one registered entry's injected face the way the render machinery does.
 * @param ctx - booted context.
 * @param name - slot name to read the first entry of.
 * @returns the value that entry's inject factory produced.
 */
function injectedOf(
  ctx: Context,
  name: 'workbench.panel' | 'conversation.session.header.utilities' | 'shell.mobile.bar',
  id?: string,
): unknown {
  const entries = ctx.slots.entries(name)
  const entry = id === undefined ? entries[0]! : entries.find(candidate => candidate.options.id === id)!
  return (entry.inject as () => unknown)()
}

/**
 * Fake Remote carrier: the generated workbench namespace plus a `$on` that
 * captures the push handler, so a test can drive `workbench/changed` itself.
 * @param initial - the view `state()` answers with.
 * @param stateOk - whether the initial `state()` read succeeds.
 * @returns the carrier, its recorded namespace, and the captured handlers.
 */
function fakeRemote(initial: WorkbenchView = { open: false, active: null }, stateOk = true) {
  const handlers = new Set<(view: WorkbenchView) => void>()
  const namespace = {
    state: vi.fn(() => Promise.resolve(stateOk
      ? { ok: true as const, value: initial }
      : { ok: false as const, error: { code: 'X', message: 'unavailable', details: {} } })),
    open: vi.fn((panelId: string | null) =>
      Promise.resolve({ ok: true as const, value: { open: true, active: panelId ?? initial.active } })),
    close: vi.fn(() => Promise.resolve({ ok: true as const, value: { open: false, active: initial.active } })),
    select: vi.fn((panelId: string) => Promise.resolve({ ok: true as const, value: { open: true, active: panelId } })),
    toggle: vi.fn(() => Promise.resolve({ ok: true as const, value: { open: !initial.open, active: initial.active } })),
    listDir: vi.fn(() => Promise.resolve({
      ok: true as const,
      value: { root: '/w', path: '/w', entries: [] },
    })),
  }
  const remote = {
    workbench: namespace,
    pluginCatalog: {
      search: vi.fn(() => Promise.resolve({ ok: true as const, value: { total: 1, entries: [CATALOG_ENTRY] } })),
      get: vi.fn(() => Promise.resolve({ ok: true as const, value: CATALOG_ENTRY })),
    },
    pluginInstall: {
      installPlugin: vi.fn(() => Promise.resolve({
        ok: true as const,
        value: { name: CATALOG_ENTRY.name, target: 'dsh-example', profile: 'web', output: '' },
      })),
      listSkins: vi.fn(() => Promise.resolve({ ok: true as const, value: [] })),
      setSkinEnabled: vi.fn((id: string, enabled: boolean) => Promise.resolve({
        ok: true as const,
        value: { id, enabled, profile: 'web' },
      })),
    },
    $on: (_event: string, handler: (view: WorkbenchView) => void) => {
      handlers.add(handler)
      return () => { handlers.delete(handler) }
    },
  }
  return { remote, namespace, handlers }
}

/** Boot the browser half over a real slot tree that declares the workbench column. */
async function bench(layout = fakeLayout(), remote = fakeRemote()) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'workbench': { kind: 'single', scope: 'root' },
      'conversation.session.header.utilities': { kind: 'list', scope: 'session' },
      // The narrow frame's page bar, which the shell declares.
      'shell.mobile.bar': { kind: 'list', scope: 'root' },
    },
  } as never, () => null)
  ctx.provide('layout', layout as never)
  // The locale plugin binds a settings scope, which reads the connection handle
  // and the forwarded-event port.
  ctx.provide('connection', { api: { settings: {} }, isLoopback: false } as never)
  ctx.provide('remote', remote.remote as never)
  // The generated namespace is its own service (`remote.<namespace>`), which
  // the fiber injects so it starts only once the Client assembly mounted it.
  ctx.provide('remote.workbench', remote.remote.workbench as never)
  ctx.provide('remote.pluginCatalog', remote.remote.pluginCatalog as never)
  ctx.provide('remote.pluginInstall', remote.remote.pluginInstall as never)
  ctx.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
  // ui-theme's service face the plugin injects: reads plus the preference write.
  const theme = {
    setTheme: vi.fn(),
    getTheme: () => ({
      preference: 'system',
      active: { id: 'light', colorScheme: 'light', tokens: {} },
      themes: [
        { id: 'light', colorScheme: 'light', tokens: {} },
        { id: 'dark', colorScheme: 'dark', tokens: {} },
      ],
      revision: 1,
    }),
  }
  ctx.provide('theme', theme as never)
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, fiber, layout, theme, ...remote }
}

describe('ui-workbench browser half', () => {
  it('declares the services it binds, including the generated Remote namespace', () => {
    expect(inject).toEqual(['theme', 'slots', 'locale', 'layout', 'remote', 'remote.workbench', 'remote.pluginCatalog', 'remote.pluginInstall'])
  })

  it('occupies the workbench column and declares both of its seats', async () => {
    const { ctx, fiber } = await bench()
    expect(ctx.slots.entries('workbench')).toHaveLength(1)
    expect(ctx.slots.spec('workbench.panel')).toEqual({ kind: 'list', scope: 'root' })
    expect(ctx.slots.spec('workbench.viewer')).toEqual({ kind: 'chain', scope: 'root' })
    await fiber.dispose()
    expect(ctx.slots.entries('workbench')).toHaveLength(0)
  })

  it('contributes the workbench page action to the narrow frame bar', async () => {
    const { ctx, fiber } = await bench()
    const entries = ctx.slots.entries('shell.mobile.bar')
    expect(entries).toHaveLength(1)
    expect(entries[0]!.options.id).toBe('workbench-toggle')
    // The page the action opens is the shared view, so the entry owns the
    // controller call rather than the shell reaching for it.
    const injected = injectedOf(ctx, 'shell.mobile.bar') as { toggle: () => void }
    // Pressing it commits the shared view through the host, which is what makes
    // the page the phone opens the same one the desktop shows.
    injected.toggle()
    await Promise.resolve()
    await fiber.dispose()
    expect(ctx.slots.entries('shell.mobile.bar')).toHaveLength(0)
  })

  it('registers the markdown, source, text and media viewers, and removes them with the fiber', async () => {
    const { ctx, fiber } = await bench()
    const entries = ctx.slots.entries('workbench.viewer')
    // Markdown and source are registered before text: all three elect
    // `text/plain`, so registration order is what decides which renders.
    expect(entries).toHaveLength(7)
    const selectors = entries.map(entry => entry.select as (owner: { name: string; mediaType: string }) => string | null)
    const elected = (mediaType: string, name = 'a.bin'): readonly (string | null)[] =>
      selectors.map(select => select({ name, mediaType })).filter(match => match !== null)
    const firstClaimant = (mediaType: string, name: string): number =>
      selectors.findIndex(select => select({ name, mediaType }) !== null)
    // Media types are elected by exactly one entry.
    expect(elected('image/png')).toEqual(['image/png'])
    expect(elected('video/mp4')).toEqual(['video/mp4'])
    expect(elected('application/json')).toEqual(['application/json'])
    expect(elected('application/octet-stream')).toEqual([])
    expect(elected('application/pdf', 'doc.pdf')).toEqual(['application/pdf'])
    // A text file is claimed by the richest viewer that can render it.
    expect(firstClaimant('text/plain', 'README.md')).toBe(0)
    expect(firstClaimant('text/plain', 'main.ts')).toBe(1)
    // Markdown, source, PDF, then the plain text catch-all.
    expect(firstClaimant('text/plain', 'notes.txt')).toBe(3)
    await fiber.dispose()
    expect(ctx.slots.entries('workbench.viewer')).toHaveLength(0)
  })

  it('feeds the theme panel from the theme/change event and writes the preference back', async () => {
    const { ctx, theme } = await bench()
    const panel = injectedOf(ctx, 'workbench.panel', 'theme') as {
      hooks: { theme: { getSnapshot(): { preference: string } } }
      set: (id: string) => void
    }
    expect(panel.hooks.theme.getSnapshot().preference).toBe('system')
    ctx.emit('theme/change', {
      preference: 'dark',
      active: { id: 'dark', colorScheme: 'dark', tokens: {} },
      themes: [],
      revision: 2,
    })
    expect(panel.hooks.theme.getSnapshot().preference).toBe('dark')
    panel.set('bloom-aurora')
    expect(theme.setTheme).toHaveBeenCalledWith('bloom-aurora')
    const withSkins = injectedOf(ctx, 'workbench.panel', 'theme') as {
      skins(): Promise<readonly { id: string }[]>
      setSkin(id: string, enabled: boolean): Promise<{ id: string; enabled: boolean }>
    }
    await expect(withSkins.skins()).resolves.toEqual([])
    await expect(withSkins.setSkin('ui-skin-x', false)).resolves.toEqual({ id: 'ui-skin-x', enabled: false, profile: 'web' })
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
    // The built-in file panel is registered by this plugin itself.
    expect(panels.getSnapshot()).toEqual([
      { id: 'files', label: '文件', order: 10 },
      { id: 'marketplace', label: '插件市场', order: 20 },
      { id: 'theme', label: '主题', order: 30 },
    ])
    ctx.slots.inject('workbench.panel', () => ctx.slots.register({
      name: 'workbench.panel',
      id: 'terminal',
      order: 20,
      label: () => '终端',
    }, () => null))
    ctx.slots.inject('workbench.panel', () => ctx.slots.register({
      name: 'workbench.panel',
      id: 'git',
      order: 5,
      label: () => 'Git',
    }, () => null))
    // Registration notifications are microtask-batched, like the other mirrors.
    await Promise.resolve()
    expect(panels.getSnapshot()).toEqual([
      { id: 'git', label: 'Git', order: 5 },
      { id: 'files', label: '文件', order: 10 },
      { id: 'marketplace', label: '插件市场', order: 20 },
      { id: 'terminal', label: '终端', order: 20 },
      { id: 'theme', label: '主题', order: 30 },
    ])
  })

  it('labels an unlabelled panel with its id and defaults its order', async () => {
    const { ctx } = await bench()
    const { panels } = wireShell(ctx)
    ctx.slots.inject('workbench.panel', () => ctx.slots.register({
      name: 'workbench.panel',
      id: 'bare',
    }, () => null))
    // Equal orders keep registration order, so the projection stays stable
    // across reloads instead of depending on sort implementation details.
    ctx.slots.inject('workbench.panel', () => ctx.slots.register({
      name: 'workbench.panel',
      id: 'tied',
      order: 10,
      label: () => '并列',
    }, () => null))
    await Promise.resolve()
    expect(panels.getSnapshot()).toEqual([
      { id: 'bare', label: 'bare', order: 0 },
      { id: 'files', label: '文件', order: 10 },
      { id: 'tied', label: '并列', order: 10 },
      { id: 'marketplace', label: '插件市场', order: 20 },
      { id: 'theme', label: '主题', order: 30 },
    ])
  })

  it('reads the host view once on load and leaves the projection alone when that read fails', async () => {
    const { ctx, layout, namespace } = await bench(fakeLayout(), fakeRemote({ open: true, active: 'files' }, false))
    wireShell(ctx)
    await Promise.resolve()
    expect(namespace.state).toHaveBeenCalledTimes(1)
    expect(layout.openWorkbench).not.toHaveBeenCalled()
    expect(layout.closeWorkbench).not.toHaveBeenCalled()
  })

  it('the shell and header inject faces both toggle through the host', async () => {
    const { ctx, namespace } = await bench()
    const { injected } = wireShell(ctx)
    injected.toggle()
    expect(namespace.toggle).toHaveBeenCalledTimes(1)
    const header = injectedOf(ctx, 'conversation.session.header.utilities') as { toggle: () => void }
    header.toggle()
    expect(namespace.toggle).toHaveBeenCalledTimes(2)
  })

  it('the marketplace panel inject face reads the catalog and installs through the host', async () => {
    const { ctx } = await bench()
    const panel = injectedOf(ctx, 'workbench.panel', 'marketplace') as {
      search: (query: { query?: string }) => Promise<{ total: number }>
      install: (url: string) => Promise<{ name: string; profile: string }>
    }
    await expect(panel.search({ query: 'example' })).resolves.toMatchObject({ total: 1 })
    await expect(panel.install(CATALOG_ENTRY.url)).resolves.toMatchObject({ name: 'dsh-example', profile: 'web' })
  })

  it('the marketplace inject face surfaces a failed Remote as an error', async () => {
    const remote = fakeRemote()
    remote.remote.pluginCatalog.search.mockResolvedValueOnce({
      ok: false,
      error: { code: 'X', message: 'catalog unavailable', details: {} },
    } as never)
    remote.remote.pluginInstall.installPlugin.mockResolvedValueOnce({
      ok: false,
      error: { code: 'X', message: 'install refused', details: {} },
    } as never)
    const { ctx } = await bench(fakeLayout(), remote)
    const panel = injectedOf(ctx, 'workbench.panel', 'marketplace') as {
      search: (query: { query?: string }) => Promise<unknown>
      install: (url: string) => Promise<unknown>
    }
    await expect(panel.search({})).rejects.toThrow('catalog unavailable')
    await expect(panel.install(CATALOG_ENTRY.url)).rejects.toThrow('install refused')
  })

  it('the file panel preview request opens the column and stores the file locally', async () => {
    const { ctx, layout } = await bench()
    const { actions, injected } = wireShell(ctx)
    const panel = injectedOf(ctx, 'workbench.panel') as { preview: (file: WorkbenchFileRef) => void }
    const file: WorkbenchFileRef = {
      name: 'photo.png',
      path: '/w/photo.png',
      url: '/workbench/file?sessionId=s&path=%2Fw%2Fphoto.png',
      mediaType: 'image/png',
    }
    panel.preview(file)
    expect(actions.preview).toHaveBeenCalledWith(file)
    expect(layout.openWorkbench).toHaveBeenCalledTimes(1)
    injected.closeFile()
    expect(actions.closeFile).toHaveBeenCalledTimes(1)
  })

  it('the file panel inject face reads a fenced listing and surfaces a host refusal', async () => {
    const { ctx, namespace } = await bench()
    const panel = injectedOf(ctx, 'workbench.panel') as {
      list: (sessionId: string, path: string | null) => Promise<unknown>
    }
    await expect(panel.list('session-1', null))
      .resolves.toEqual({ root: '/w', path: '/w', entries: [] })
    expect(namespace.listDir).toHaveBeenCalledWith('session-1', null)

    namespace.listDir.mockResolvedValueOnce({
      ok: false,
      error: { code: 'WORKBENCH_OUTSIDE_WORKSPACE', message: 'outside' },
    } as never)
    await expect(panel.list('session-1', '/elsewhere')).rejects.toThrow('outside')
  })
})

describe('WorkbenchController', () => {
  it('open calls the host Remote, then projects the committed view onto the shell', async () => {
    const { ctx, layout, namespace } = await bench()
    const { actions } = wireShell(ctx)
    await ctx.workbench.open('files')
    expect(namespace.open).toHaveBeenCalledWith('files')
    expect(actions.select).toHaveBeenCalledWith('files')
    expect(layout.openWorkbench).toHaveBeenCalledTimes(1)
  })

  it('open without an id keeps the host selection; close and toggle delegate', async () => {
    const { ctx, layout, namespace } = await bench()
    wireShell(ctx)
    await ctx.workbench.open()
    expect(namespace.open).toHaveBeenCalledWith(null)
    // The initial state read already projected the closed host view once.
    await ctx.workbench.close()
    expect(layout.closeWorkbench).toHaveBeenCalledTimes(2)
    await ctx.workbench.toggle()
    expect(namespace.toggle).toHaveBeenCalledTimes(1)
  })

  it('projects a pushed view onto the selection store and the column', async () => {
    const { ctx, layout, handlers } = await bench()
    const { actions } = wireShell(ctx)
    for (const handler of handlers) handler({ open: true, active: 'files' })
    expect(layout.openWorkbench).toHaveBeenCalledTimes(1)
    expect(actions.select).toHaveBeenCalledWith('files')
    for (const handler of handlers) handler({ open: false, active: null })
    // One close from the push plus the one the initial state read projected.
    expect(layout.closeWorkbench).toHaveBeenCalledTimes(2)
    expect(actions.clear).toHaveBeenCalledTimes(2)
  })

  it('queues a view that arrives before the shell mounted, then applies it on attach', () => {
    const layout = fakeLayout()
    const controller = new WorkbenchController(layout, fakeRemote().namespace)
    controller.applyView({ open: true, active: 'files' })
    expect(layout.openWorkbench).not.toHaveBeenCalled()
    const actions = { select: vi.fn(), clear: vi.fn(), preview: vi.fn(), closeFile: vi.fn() }
    controller.attachActions(actions)
    expect(layout.openWorkbench).toHaveBeenCalledTimes(1)
    expect(actions.select).toHaveBeenCalledWith('files')
  })

  it('leaves the previous view in place when the Remote call fails', async () => {
    const layout = fakeLayout()
    const remote = fakeRemote()
    remote.namespace.open.mockResolvedValueOnce({ ok: false, error: { code: 'X', message: 'nope' } } as never)
    const controller = new WorkbenchController(layout, remote.namespace)
    const actions = { select: vi.fn(), clear: vi.fn(), preview: vi.fn(), closeFile: vi.fn() }
    controller.attachActions(actions)
    await controller.open('files')
    expect(layout.openWorkbench).not.toHaveBeenCalled()
    expect(actions.select).not.toHaveBeenCalled()
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
