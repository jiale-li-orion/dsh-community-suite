# Agent Note: The workbench view is host-owned, and both planes mutate it

Status: implemented

English | [中文](2026-09-09-workbench-shared-view.zh.md)

## Problem

The workbench column and its panel seat (the [column note](2026-09-09-workbench-column-slot.md), the [panel seat note](2026-09-09-workbench-panel-seat.md)) compose UI, but the *view* they show — open/closed, selected panel — lived only in the browser's layout store and selection store. An agent could not drive the workbench at all, and two browsers could disagree about what was open. The community project with the closest feature, `dsh-music-player`, solves this with a host-owned intent queue that its tool writes and its client polls every two seconds (`repos/dsh-music-player/lib/index.js:1522`, `:3877`); its own audit recorded the cost — no service seam, no events, one poll per client forever (`notes/dsh-music-player.md:70-97`).

## Decision

**One host service owns the shared view; every mutation commits and pushes.** `@deepseek-ai/dsh-workbench` publishes `ctx.workbench` with `state()`, `open(panelId | null)`, `close()`, `select(panelId)`, and `toggle()` as `@Remote` methods. Each commit assigns the view, emits `workbench/changed` with a detached copy, and returns the committed value. The event is added to `API_REMOTE_FORWARDED_EVENTS`, so a browser receives it verbatim through `ctx.remote.$on` with no polling.

**Agent tools write the same view and return a notice.** `@deepseek-ai/dsh-tool-workbench` registers `workbench_open`, `workbench_close`, and `workbench_status`; they call the service, never the browser, and return `Workbench opened on panel "<id>".` / `Workbench closed.` plus the structured `open`/`active` fields. The tool set is a separate package because a service package default-exports its class while a function plugin named-exports `name`/`inject`/`apply`, and mixing the two forms makes the Loader discard the function namespace (`packages/AGENTS.md`).

**The browser is a projection, not a second authority.** The client's `WorkbenchController` holds no view of its own: gestures call the Remote, and the pushed `workbench/changed` is projected onto the shell's selection store and `ctx.layout`'s column geometry. A view that arrives before the shell entry mounted is queued and applied on attach, so the initial `state()` read is never lost. A failed Remote call leaves the previous view in place rather than inventing state.

**Directory listings are fenced to the session workspace.** `listDir(sessionId, path)` resolves the session's recorded `cwd` as the root and lists through `ctx.fs`, refusing a session without one and any path that escapes the root with `WORKBENCH_OUTSIDE_WORKSPACE`. The built-in file panel therefore reads the tree the agent operates in, through the same capability, instead of walking paths itself.

## Alternatives considered

- **Keep the view in the browser and have tools send a UI command.** The community pattern inverted: the tool would need a browser to exist, so a headless session or a second client could not act, and the state would still diverge between clients.
- **Poll a host route (the music-player shape).** Rejected: latency per gesture, one poll per client forever, and it duplicates a transport the forwarded-event allowlist already provides.
- **Put the view in a client service only.** Rejected: an agent tool cannot reach a browser service, which is the whole point of the shared workbench.
- **Fence listings to the process working directory.** Rejected: it ignores the per-session workspace the agent actually operates in, and the community media route's whole-filesystem scope is the counter-example the audit flagged (`notes/dsh-media-preview.md:6`).
- **Ship the tools inside the service package.** Rejected on the Loader's export-form rule above.

## Consequences

The workbench is now genuinely shared: an agent can open or select a panel and the human sees it, a human gesture updates the same value the agent reads, and a reload resumes the view another client committed. The cost is one process-global view — every connected client and agent agrees, which is correct for a workspace surface but means per-client views are not expressible yet. The invariant companion asserts each emitted payload equals the state the service holds, so a detached or stale commit fails loud instead of desynchronizing the planes.

## Testing

`packages/workbench/workbench/tests/workbench.spec.ts` boots the service over the real `fs-local` backend and a session record: the Remote surface, every commit's emitted payload, real listings, relative-path resolution, and both refusals. `packages/workbench/tool-workbench/tests/tool-workbench.spec.ts` drives the three tools through the real tools registry against a recording fake service. `packages/client/ui-workbench/tests/browser-plugin.client.spec.ts` covers the projection: gestures call the Remote, a pushed view lands on the selection store and the column, a pre-mount view is queued, and a failed call changes nothing. `pnpm run test:gui` and the `DSH_SNAPSHOT=replay` web lane cover the assembled browser.
