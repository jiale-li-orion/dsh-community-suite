# Agent Note: Narrow single-panel workbench presentation

Status: implemented

English | [中文](2026-09-10-narrow-single-panel-workbench.zh.md)

> Scope: how AppFrame presents the workbench below the sidebar auto-collapse breakpoint, and why that presentation may read the shared workbench view without ever writing it.

## Problem

Below the auto-collapse breakpoint the concession chain cannot fit the center beside the workbench: the sidebar rail plus `CENTER_MIN` plus `WORKBENCH_MIN` already exceeds the viewport, so the solver derives the workbench to zero width and `WorkbenchShell` renders nothing. The session-header toggle therefore looked inert on that client while it had already committed the shared view — a phone tap opened the panel on the PC and showed nothing on the phone.

## Decision

Below the breakpoint, an open workbench becomes **the single panel**: the frame drops to two tracks, the workbench occupies the track beside the rail, and the conversation stays mounted at `display: none` so its session state survives the trip back. The shell's own close control returns to the conversation.

The presentation **reads the shared workbench preference and never writes it**. A viewport change — rotation, window resize — cannot open, close, or reselect the workbench another client is showing; only a human gesture commits, and that still goes through the host service. No new breakpoint was introduced: the narrow regime is the existing `SIDEBAR_AUTO_COLLAPSE` reading.

## Alternatives considered

- **Granting the workbench a minimum width in the solver, pushing the center below its floor** — breaks the concession contract and the wide layout.
- **Overlaying the workbench above the conversation** — adds a second presentation channel beside the shell's geometry ownership.
- **Auto-closing the workbench when the viewport narrows** — writes shared state from a local viewport change, which the single-authority rule forbids.

The shared-view authority itself stays with [the workbench shared view](../feature/2026-09-09-workbench-shared-view.md); this note adds only the narrow presentation of a view that note already owns.

## Consequences

- `gridTemplateColumns` is two tracks while the single panel is shown; drag handles are suppressed for the panel that fills the frame, and the details column has no width to occupy at this size.
- Wide viewports keep the four-column concession chain unchanged.
- A frame that is narrow while other columns are open still hides them; the details column is presented by the wide layout only.

## Verification

`packages/client/ui-layout/tests/app-frame.client.spec.tsx` covers the presentation, the return to four columns on close, viewport-resize without a preference write, restoration of the shared width when the frame widens again, and the absent resize handle.
