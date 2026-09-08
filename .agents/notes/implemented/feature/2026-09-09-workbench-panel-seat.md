# Agent Note: Workbench panels are slot entries, not registry records

Status: implemented

English | [中文](2026-09-09-workbench-panel-seat.zh.md)

## Problem

The `workbench` column (the [column note](2026-09-09-workbench-column-slot.md)) gives a workbench a seat, but nothing yet defines how a panel gets into it. The community workbenches solve this in one of two ways, and neither fits this client stack: `dsh-better-sidebar` publishes `ctx.betterSidebar.registerTab(descriptor)` whose descriptor carries a React component (`repos/DSH-better-sidebar/src/client/service.ts:1-22`), and other plugins hardcode their panels inside their own bundle. The client rules forbid the first shape — "UI domains share only JSON-compatible data and callbacks … Route ReactNode content through a slot; do not add ReactNode-valued owner props or injected members" (`packages/client/AGENTS.md`) — and the second makes a panel impossible to compose.

## Decision

**A workbench panel is one `workbench.panel` slot entry; there is no parallel panel registry.** The shell occupies the column and declares `workbench.panel` as a `keyed`/`root` seat, so a panel registers through the one composition API:

A panel registers with `ctx.slots.register({ name: 'workbench.panel', id: '<panel id>', order, label }, Component)` inside a `ctx.slots.inject('workbench.panel', ...)` callback, so the contribution waits for the declaration and leaves with the registrant's fiber.

Panel membership therefore lives in the slot ledger: registration and disposal follow the registrant's fiber, duplicate keys fail loud at load, and the shell never enumerates plugins.

**The shell projects the registry into its tab list and owns only the selection.** `ctx.slots.entries('workbench.panel')` plus `ctx.slots.subscribe` feed a `SnapshotStore<readonly WorkbenchPanelTab[]>` exposed through the registration's inject `hooks` compartment, which the renderer binds as `usePanels`; the selected id lives in the shell entry's declared store (`createWorkbenchStore`). Keyed dispatch (`renderSlot('workbench.panel', { width }, { entryKey: active })`) mounts exactly the selected panel, and an unregistered selection falls back to the first tab.

**`ctx.workbench` carries transitions only.** `open(panelId?)` writes the selection and opens the column, `close()` and `toggle()` delegate to `ctx.layout`; the controller is wired through the registration's inject hook, the same assembly pattern `ctx.layout` uses. The built-in entry point is a list entry in `conversation.session.header.utilities` (id `workbench-toggle`, order `-10`) that carries no live column state; it orders before the session's own utilities so the session-log export stays the right-edge control the header geometry contract pins.

**A collapsed column renders nothing.** The shell returns null while `collapsed`, so the workbench never enters the accessibility tree of a page the user has not opened it on. The component stays mounted, so its entry store's selection survives closing and reopening; panel components unmount like any tab switch.

## Alternatives considered

- **A `ctx.workbench.registerPanel({ id, component })` service.** The shape community workbenches use, and the one a plugin author would expect. Rejected: it puts React components in a service face, which the client data rule forbids, and it would duplicate the ledger's lifecycle (duplicate detection, disposal, reload safety) that the slot registry already owns.
- **A list slot rendering every panel, hiding inactive ones with CSS.** Simpler dispatch, but every panel's effects and subscriptions run while hidden, and the shell would still need the tab list separately.
- **Keyed dispatch with a static `keyProps` table.** Types per panel id at the dispatch site, but the table is declaration-time while panels register at runtime, so dynamic panels could not be typed by it.
- **Extending `details` for panels.** Already rejected in the column note: the column is tool chrome with a 520px ceiling and session scope.

## Consequences

A panel is one register call plus a component, and everything else — ordering, tabs, selection, teardown — is framework semantics on the entry axis. The cost is that a panel cannot be contributed without a slot registration, so a non-UI producer (a host service, a command) must go through a client plugin; that is the same constraint every other UI surface here has. The tab projection is one small mirror whose only job is to turn ledger entries into `{ id, label, order }` rows, and it drops entries registered without a `key` rather than inventing an id.

## Testing

`packages/client/ui-workbench/tests/browser-plugin.client.spec.ts` boots the browser half over a real `SlotRegistry`: the column occupant and the declared seat, the header toggle, dictionary registration and withdrawal on fiber disposal, the live tab projection (ordering and later registrations), the controller's select-then-open semantics, and the unwired fail-loud. `tests/workbench-shell.client.spec.tsx` covers the empty state, first-panel and selected-panel dispatch, tab clicks writing the selection, the single-panel tab-strip collapse, and the unregistered-selection fallback. `pnpm run gen-client-catalog` regenerates the agent-facing slot catalog with the new seat, and `test:gui` plus the `DSH_SNAPSHOT=replay` web lane cover the assembled browser.
