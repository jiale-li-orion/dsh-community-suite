/**
 * Workbench plugin, browser half. One register() call occupies ui-layout's
 * `workbench` column and declares its two seats — `workbench.panel` for panel
 * bodies and `workbench.viewer` for the file viewer chain — seats the shell
 * store, and injects the panel-tab projection plus the column transition.
 * Further contributions add the session-header toggle, register the built-in
 * file panel, and register the media and text viewers.
 *
 * The host workbench service is the single authority for the shared view:
 * every gesture here calls it, and its `workbench/changed` push is projected
 * back onto the shell store and the column, so a human click and an agent tool
 * call converge on one state. Panel membership stays in this browser's slot
 * registry, which the shell projects into its tab list; which file this window
 * previews stays browser-local in the shell store.
 * @module @deepseek-ai/dsh-client-ui-workbench/client
 */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import type { BoundActions, StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { WorkbenchListing } from '@deepseek-ai/dsh-workbench/types'
import type {} from '@deepseek-ai/dsh-workbench/remote'
import type { WorkbenchFileRef, WorkbenchPanelTab } from './contract/slots.ts'
import { CodeViewer, codeTypeSelector } from './CodeViewer.tsx'
import { createFilePanelStore } from './file-panel-store.ts'
import { FilePanel } from './FilePanel.tsx'
import { MarkdownViewer, markdownTypeSelector } from './MarkdownViewer.tsx'
import { PdfViewer, pdfTypeSelector } from './PdfViewer.tsx'
import { MarketplacePanel } from './MarketplacePanel.tsx'
import { createMediaViewer, mediaTypeSelector } from './MediaViewer.tsx'
import { TextViewer, textTypeSelector } from './TextViewer.tsx'
import { ThemePanel } from './ThemePanel.tsx'
import type { ThemePanelInjected } from './ThemePanel.tsx'
import { en, NS, zh } from './locales.ts'
import type { WorkbenchKey } from './locales.ts'
import { createWorkbenchStore } from './stores.ts'
import { WorkbenchController } from './service.ts'
import type { IWorkbench } from './service.ts'
import { WorkbenchShell } from './WorkbenchShell.tsx'
import { WorkbenchToggle } from './WorkbenchToggle.tsx'

export type { IWorkbench } from './service.ts'
export type { WorkbenchFileRef, WorkbenchPanelTab, WorkbenchPanelOwnerProps, WorkbenchViewerOwnerProps } from './contract/slots.ts'
export type { CodeViewerProps } from './CodeViewer.tsx'
export type { MarkdownViewerProps } from './MarkdownViewer.tsx'
export type { PdfViewerProps } from './PdfViewer.tsx'
export type { MediaViewerProps } from './MediaViewer.tsx'
export type { TextViewerProps } from './TextViewer.tsx'
export type { ThemePanelInjected, ThemePanelProps } from './ThemePanel.tsx'
export type { FilePanelInjected, FilePanelProps } from './FilePanel.tsx'
export type { MarketplaceInjected, MarketplacePanelProps } from './MarketplacePanel.tsx'
export type { WorkbenchShellInjected, WorkbenchShellProps } from './WorkbenchShell.tsx'
export type { WorkbenchToggleInjected, WorkbenchToggleProps } from './WorkbenchToggle.tsx'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The outward face only; the concrete service stays inside this plugin. */
    workbench: IWorkbench
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Workbench copy: the column title, tabs, empty state, toggle, and file panel. */
    'workbench': WorkbenchKey
  }
}

/** Required services (cordis fiber inject — the loader passes all module exports as an object plugin). */
export const inject = ['theme', 'slots', 'locale', 'layout', 'remote', 'remote.workbench', 'remote.pluginCatalog', 'remote.pluginInstall']

/**
 * Project the panel registry into the shell's tab list. Registration order is
 * the tie-breaker so equal orders stay deterministic across reloads.
 * @param entries - the `workbench.panel` registry entries.
 * @returns ordered tabs.
 */
function projectTabs(entries: readonly StoredEntry[]): readonly WorkbenchPanelTab[] {
  return entries
    .map((entry, index) => {
      /* v8 ignore next -- list-slot registration requires options.id */
      const id = entry.options.id ?? ''
      return {
        id,
        // An unlabelled panel is addressed by its id, so no tab renders blank.
        label: resolveSlotLabel(entry.options.label) ?? id,
        order: entry.options.order ?? 0,
        index,
      }
    })
    .sort((a, b) => a.order - b.order || a.index - b.index)
    .map(({ id, label, order }) => ({ id, label, order }))
}

/**
 * Client plugin body: dictionaries, the `ctx.workbench` face over the host
 * service, the column occupant with its panel seat, the built-in file panel,
 * and the header toggle.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-workbench: dictionaries')

  const controller = new WorkbenchController(ctx.layout, ctx.remote.workbench)
  // ui-theme exposes `getTheme` plus a `theme/change` event, not a bare
  // observable, so the panel reads a store this plugin feeds from both.
  const themeState = createSnapshotStore(ctx.theme.getTheme())
  ctx.effect(() => ctx.on('theme/change', (snapshot) => { themeState.set(snapshot) }), 'ui-workbench: theme state')
  const panels = createSnapshotStore<readonly WorkbenchPanelTab[]>([])
  ctx.effect(() => {
    const project = (): void => { panels.set(projectTabs(ctx.slots.entries('workbench.panel'))) }
    project()
    return ctx.slots.subscribe('workbench.panel', project)
  }, 'ui-workbench: panel tab projection')

  // The one shared-view projection: the host push, plus one initial read so a
  // reload resumes the view another client (or the agent) committed.
  ctx.effect(() => {
    const off = ctx.remote.$on('workbench/changed', (view) => { controller.applyView(view) })
    void ctx.remote.workbench.state().then((result) => { if (result.ok) controller.applyView(result.value) })
    return off
  }, 'ui-workbench: shared view projection')

  /**
   * Read one fenced directory listing through the host service.
   * @param sessionId - session whose cwd fences the listing.
   * @param path - directory to list; null lists the workspace root.
   * @returns the listing, or a rejection naming the host failure.
   */
  const listDir = async (sessionId: SessionId, path: string | null): Promise<WorkbenchListing> => {
    const result = await ctx.remote.workbench.listDir(sessionId, path)
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }

  ctx.effect(() => {
    const disposeService = ctx.reflect.provide('workbench', controller)
    const disposeRegistration = ctx.slots.register({
      name: 'workbench',
      children: {
        'workbench.panel': { kind: 'list', scope: 'root' },
        'workbench.viewer': { kind: 'chain', scope: 'root' },
      },
      locale: NS,
      store: createWorkbenchStore,
      inject: (actions: BoundActions<ReturnType<typeof createWorkbenchStore>>) => {
        controller.attachActions(actions)
        return {
          hooks: { panels },
          toggle: () => { void controller.toggle() },
          closeFile: () => { controller.closeFile() },
        }
      },
    }, WorkbenchShell)
    return () => {
      disposeRegistration()
      // provide()'s disposer settles asynchronously; teardown is synchronous fire-and-forget.
      void disposeService()
    }
  }, 'ui-workbench: service + column registration')

  ctx.slots.inject('workbench.panel', () => ctx.slots.register({
    name: 'workbench.panel',
    id: 'files',
    order: 10,
    label: () => zh['files.title'],
    locale: NS,
    store: createFilePanelStore,
    inject: () => ({ list: listDir, preview: (file: WorkbenchFileRef) => { controller.preview(file) } }),
  }, FilePanel))

  ctx.slots.inject('workbench.panel', () => ctx.slots.register({
    name: 'workbench.panel',
    id: 'theme',
    order: 30,
    label: () => zh['theme.title'],
    locale: NS,
    inject: (): ThemePanelInjected => ({
      hooks: { theme: themeState },
      set: (id: string) => { ctx.theme.setTheme(id) },
      skins: async () => {
        const result = await ctx.remote.pluginInstall.listSkins()
        if (!result.ok) throw new Error(result.error.message)
        return result.value
      },
      setSkin: async (id: string, enabled: boolean) => {
        const result = await ctx.remote.pluginInstall.setSkinEnabled(id, enabled)
        if (!result.ok) throw new Error(result.error.message)
        return result.value
      },
    }),
  }, ThemePanel))

  ctx.slots.inject('workbench.panel', () => ctx.slots.register({
    name: 'workbench.panel',
    id: 'marketplace',
    order: 20,
    label: () => zh['marketplace.title'],
    locale: NS,
    inject: () => ({
      hooks: { locale: ctx.locale },
      search: async (query: { query?: string; category?: string; limit?: number }) => {
        const result = await ctx.remote.pluginCatalog.search(query)
        if (!result.ok) throw new Error(result.error.message)
        return result.value
      },
      install: async (url: string) => {
        const result = await ctx.remote.pluginInstall.installPlugin(url)
        if (!result.ok) throw new Error(result.error.message)
        return result.value
      },
    }),
  }, MarketplacePanel))

  // Markdown and source before the plain text entry: every one of them elects
  // the same host media type (`text/plain`), so only the order decides, and
  // text is the catch-all for what has no richer preview.
  ctx.slots.inject('workbench.viewer', () => ctx.slots.register({
    name: 'workbench.viewer',
    select: markdownTypeSelector,
    locale: NS,
  }, MarkdownViewer))

  ctx.slots.inject('workbench.viewer', () => ctx.slots.register({
    name: 'workbench.viewer',
    select: codeTypeSelector,
    locale: NS,
  }, CodeViewer))

  ctx.slots.inject('workbench.viewer', () => ctx.slots.register({
    name: 'workbench.viewer',
    select: pdfTypeSelector,
    locale: NS,
  }, PdfViewer))

  // Text last: the media selectors decline every text type, so the chain order
  // only decides which of two non-overlapping selectors is asked first.
  ctx.slots.inject('workbench.viewer', () => ctx.slots.register({
    name: 'workbench.viewer',
    select: textTypeSelector,
    locale: NS,
  }, TextViewer))

  for (const family of ['image', 'audio', 'video'] as const) {
    ctx.slots.inject('workbench.viewer', () => ctx.slots.register({
      name: 'workbench.viewer',
      select: mediaTypeSelector(family),
      locale: NS,
    }, createMediaViewer(family)))
  }

  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'workbench-toggle',
    // Before the session's own utilities, so the session-log export stays the
    // right-edge control the header's geometry contract pins.
    order: -10,
    locale: NS,
    inject: () => ({ toggle: () => { void controller.toggle() } }),
  }, WorkbenchToggle))
}
