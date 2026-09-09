# Agent Note: A background is a declared frame seat, not a body layer

Status: implemented

English | [中文](2026-09-09-wallpaper-background-seat.zh.md)

## Problem

The audited `dsh-wallpaper-engine` paints its background by appending a `body`-layer element at `z-index: -2` and coupling to the shell's internal DOM and theme hooks (`notes/dsh-wallpaper-engine.md:46`). Its audit verdict was `extract design` precisely because that layer is not disposable: it sits outside the slot tree, so nothing owns its teardown, and any shell change can move it. The workbench needed the *feature* — a workspace image behind the conversation — without the fragile paint target.

## Decision

**The frame declares one background seat.** `ui-layout` gains a `shell.background` list slot: a full-bleed, click-through layer rendered before the columns in document order, so the columns paint over it where they paint a surface and the conversation shows it where it does not. The columns deliberately carry no `z-index`: a column that created a stacking context would trap a fixed-position dialog registered inside its subtree — the settings modal renders under `sidebar.settings` — beneath the later columns. A feature that wants to paint the surface registers an entry, so the layer's lifetime is the entry's fiber and the shell owns the stacking order. The `shell.overlay` seat could not serve: it paints above every column by design.

**The wallpaper is a workbench panel plus that entry.** `@deepseek-ai/dsh-client-ui-workbench` registers a `wallpaper` panel (order 30) that lists the current session's image files through the same fenced listing the file panel uses, and a `shell.background` entry that paints the chosen image with a scrim. The choice lives in one snapshot store owned by the plugin, exposed as `ctx.wallpaper`; the panel writes it and the background entry reads it through its inject `hooks` compartment, so neither registration reaches into the other.

**The choice is browser-local and forgiving.** It persists per browser under a namespaced key, and a URL whose session no longer exists fails to load — the layer then hides itself rather than leaving a broken background. Nothing about the choice reaches the host, the agent, or the session log: which picture a person likes is not session state.

## Alternatives considered

- **Append a `body` layer (the audited approach).** Rejected: outside the slot tree, so no fiber owns it and no declaration authorizes it.
- **Paint through `shell.overlay` with a negative z-index.** Rejected: the overlay's own stacking context sits above every column, so a child cannot reliably paint behind them.
- **Override a theme token with the image URL.** Rejected: the token catalog is typed `CSS color` and validated, and a URL in a color token breaks every consumer that reads it as one.
- **Replace the `conversation` or `root` seat.** Rejected: that shadows shipped UI to paint a picture.
- **Persist the wallpaper on the host.** Rejected: it is per-browser taste, and putting it in shared state would make one window's picture another's.

## Consequences

A wallpaper now costs one declared seat, one panel, and one small store; removing the bundle row removes the layer and the panel with it, and the frame is unchanged when no entry registers. The scrim keeps conversation text readable over any image. The cost is a new core-ish seat in `ui-layout` (additive, like the workbench column), a panel that browses the workspace through the file panel's fenced listing, and a layering constraint on every column: adding `z-index` to one re-traps the dialogs registered inside it.

## Testing

`packages/client/ui-workbench/tests/wallpaper.client.spec.ts` covers the store/service pair and its storage tolerance (absent, unparsable, wrong-shaped, and a storage that refuses writes). `tests/wallpaper-panel.client.spec.tsx` covers the no-session state, image filtering, URL construction, the current-choice line, clear, empty and failed listings, a non-Error rejection, and a settlement after unmount, plus the background layer's render, hide-on-error, and null state. `tests/browser-plugin.client.spec.ts` covers the service, both registrations, and their teardown; `packages/client/ui-layout/tests` cover the frame with the new seat. `pnpm run test:gui` and the `DSH_SNAPSHOT=replay` web lane cover the assembled browser.
