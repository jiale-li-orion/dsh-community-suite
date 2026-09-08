/**
 * Workbench plugin, browser half. One register() call occupies ui-layout's
 * `workbench` column and declares its `workbench.panel` seat, seats the
 * selection store, and injects the panel-tab projection plus the column
 * transition. A second contribution adds the session-header toggle. The
 * `ctx.workbench` service is the cross-plugin transition face; panel
 * membership is the slot registry's, so a plugin adds a panel by registering
 * into the declared seat and nothing here enumerates plugins.
 * @module @deepseek-ai/dsh-client-ui-workbench/client
 */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import type { BoundActions, StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { WorkbenchPanelTab } from './contract/slots.ts'
import { en, NS, zh } from './locales.ts'
import type { WorkbenchKey } from './locales.ts'
import { createWorkbenchStore } from './stores.ts'
import { WorkbenchController } from './service.ts'
import type { IWorkbench } from './service.ts'
import { WorkbenchShell } from './WorkbenchShell.tsx'
import { WorkbenchToggle } from './WorkbenchToggle.tsx'

export type { IWorkbench } from './service.ts'
export type { WorkbenchPanelTab, WorkbenchPanelOwnerProps } from './contract/slots.ts'
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
    /** Workbench copy: the column title, tabs, empty state, and toggle. */
    'workbench': WorkbenchKey
  }
}

/** Required services (cordis fiber inject — the loader passes all module exports as an object plugin). */
export const inject = ['slots', 'locale', 'layout']

/**
 * Project the panel registry into the shell's tab list. Registration order is
 * the tie-breaker so equal orders stay deterministic across reloads.
 * @param entries - the `workbench.panel` registry entries.
 * @returns ordered tabs, entries without a key dropped.
 */
function projectTabs(entries: readonly StoredEntry[]): readonly WorkbenchPanelTab[] {
  return entries
    .map((entry, index) => ({
      id: entry.options.id ?? '',
      label: resolveSlotLabel(entry.options.label) ?? entry.options.id ?? '',
      order: entry.options.order ?? 0,
      index,
    }))
    .filter(tab => tab.id !== '')
    .sort((a, b) => a.order - b.order || a.index - b.index)
    .map(({ id, label, order }) => ({ id, label, order }))
}

/**
 * Client plugin body: dictionaries, the `ctx.workbench` face, the column
 * occupant with its panel seat, and the header toggle.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-workbench: dictionaries')

  const controller = new WorkbenchController(ctx.layout)
  const panels = createSnapshotStore<readonly WorkbenchPanelTab[]>([])
  ctx.effect(() => {
    const project = (): void => { panels.set(projectTabs(ctx.slots.entries('workbench.panel'))) }
    project()
    return ctx.slots.subscribe('workbench.panel', project)
  }, 'ui-workbench: panel tab projection')

  ctx.effect(() => {
    const disposeService = ctx.reflect.provide('workbench', controller)
    const disposeRegistration = ctx.slots.register({
      name: 'workbench',
      children: {
        'workbench.panel': { kind: 'list', scope: 'root' },
      },
      locale: NS,
      store: createWorkbenchStore,
      inject: (actions: BoundActions<ReturnType<typeof createWorkbenchStore>>) => {
        controller.attachActions(actions)
        return {
          hooks: { panels },
          toggle: () => { ctx.layout.toggleWorkbench() },
        }
      },
    }, WorkbenchShell)
    return () => {
      disposeRegistration()
      // provide()'s disposer settles asynchronously; teardown is synchronous fire-and-forget.
      void disposeService()
    }
  }, 'ui-workbench: service + column registration')

  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'workbench-toggle',
    // Before the session's own utilities, so the session-log export stays the
    // right-edge control the header's geometry contract pins.
    order: -10,
    locale: NS,
    inject: () => ({ toggle: () => { controller.toggle() } }),
  }, WorkbenchToggle))
}
