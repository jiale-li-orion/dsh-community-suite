# Agent Note: The frame declares an optional workbench column

Status: implemented

English | [中文](2026-09-09-workbench-column-slot.zh.md)

## Problem

The shipped `AppFrame` composed three columns — `sidebar`, `conversation`, `details` — and every one of them is owned: `ui-sidebar` occupies the navigation column and declares its inner seats, `ui-conversation` occupies the center and the details column, and the details column is tool-inspection chrome with a 300–520px contract range. A workbench (file tree, editor, terminal, git, media) therefore had nowhere to live: registering into `sidebar` or `details` replaces that column and destroys the seats it declares, and `shell.overlay` is a click-through floating layer that does not reflow the conversation.

Community workbenches fill the gap by bypassing composition: `dsh-better-sidebar` creates a `<div>` on `document.body`, mounts a second React root into it, and keeps it attached with a `MutationObserver` plus a continuous `requestAnimationFrame` measurement loop (`repos/DSH-better-sidebar/src/client/index.tsx:196-230`, `:280-296`). That surface cannot participate in the slot ledger, cannot be replaced by another plugin, and does not unload with the entry that created it. The local contract allows exactly one composition API — `ctx.slots.register({name, children?, store?, inject?}, Component)`, with `children` as declaration and render authorization (`.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md:13-52`).

## Decision

**`AppFrame` declares a fifth child slot, `workbench`, as an optional single/root column between the conversation and the details column.** The column is additive: with no registrant it resolves to zero width, renders nothing, and paints no border, so a composition that registers no workbench is visually and behaviorally unchanged. `ui-layout`'s SlotMap gains the entry and a `WorkbenchOwnerProps` share of exactly `{ collapsed, width }`, mirroring the sidebar owner share; the column is root-scoped because a workbench is workspace state, not session state, and therefore survives a session switch.

**The concession chain gains one term and keeps its order: shrink details → close details → shrink workbench → close workbench → center floor.** The solver stays pure and breakpoint-free; `ctx.layout` gains `openWorkbench()`/`closeWorkbench()` beside the existing panel actions, and the workbench drag handle uses the same pointer-capture plus rAF-throttled write path as the other two columns. A zero-width workbench keeps its subtree mounted, exactly like a closed details column, so reopening preserves panel state.

## Alternatives considered

- **Adopt `dsh-better-sidebar` as the workbench shell.** Its registry contract is the best in the community set and is being extracted for the panel API, but HEAD requires DSH ≥ 0.1.2-rc.1 while this suite is pinned to rc.7, and its own surface is a parallel React root. Mounting it would put two composition mechanisms in one page.
- **Occupy the `details` slot.** Rejected: it replaces tool inspection, its contract range tops out at 520px, and it is session-scoped, so a workbench would unmount on session switches.
- **Use `shell.overlay` for a floating workbench.** Rejected: the layer is click-through and outside the column tracks, so a docked file tree or editor cannot reflow the conversation.
- **Add the column by editing the shipped row's behavior.** Rejected: the child declaration is additive by construction; nothing else about `AppFrame` changes when no workbench registers.

## Consequences

A workbench plugin can now compose through the one sanctioned API, and a third party can replace the whole workbench by occupying the column — the seats it declares disappear with it, which is the same takeover semantics every other column has. The cost is a core-package edit: one SlotMap entry, one owner-share interface, one solver term, one store field set, one grid track, and a drag handle. The concession order is now a four-way contract that tests pin at every seam.

`packages/client/ui-layout/src/*` sits under the GUI coverage-debt exemption, so this change does not move the repository coverage gate; the new behavior is covered by the package's own suite instead.

## Testing

`tests/columns.client.spec.ts` pins the concession chain: every step, both seams (step 1/2 and step 4/5), clamp behavior for all three preferences, the sidebar-never-concedes fallback, and pure recovery on re-widening. `tests/layout-store.client.spec.ts` covers the new store fields and actions (default, clamp, open-preserves-dragged-width, close-zeroes, no persistence). `tests/app-frame.client.spec.tsx` covers the rendered grid, the workbench owner share, the added drag handle and its leftward resize math, independent workbench+details columns, and concession under a narrow viewport. `tests/apply.client.spec.ts` asserts the five declared children, including `workbench` and `shell.overlay`. `pnpm run test:gui` and the `DSH_SNAPSHOT=replay` web lane cover the assembled browser.
