# Agent Note: Publishing the connection phase for a connection-loss banner

Status: implemented

English | [中文](2026-09-10-connection-phase-banner.zh.md)

> Scope: why the connection plugin publishes its phase as a service surface, and why the banner that consumes it stays presentation-only.

## Problem

A dropped connection was invisible. `ConnectionController` reports `reconnecting` to the one consumer allowed to start the loop, and that consumer (the runtime object layer) deliberately drops generation-scoped interaction state and rebuilds it after the next handshake. Nothing tells the human. On a phone behind a relay the symptom is an application that appears to have stopped responding, with the user's last unsent draft still sitting in the composer.

The phase was also unreadable by anyone else: `start()` throws on a second consumer, and `hostDescription` retracts on disconnect without ever naming the state, so a UI plugin had no supported way to observe it.

## Decision

The connection plugin now publishes the phase it already computes as `ConnectionHandle.connectionState` — a `getSnapshot`/`subscribe` pair updated from the same `onStateChange` wrapper that feeds the consumer sink, and cleared when the loop stops. It is absent before the loop starts, which is honest: no loop, no claim about connectivity.

`@deepseek-ai/dsh-client-ui-connection-status` renders that phase into ui-layout's `shell.overlay` list, the frame-wide additive seat. The entry renders nothing while connected, so the overlay layer stays empty on the normal path, and nothing at all before the loop starts.

The banner is presentation-only. Reconnecting has no auto-retry of anything a user asked for: no re-sent message, no re-approval, no plugin install. The runtime already owns what state must be dropped and rebuilt, and duplicating any of it here would create a second, weaker copy of that decision.

## Alternatives considered

- **Letting the banner call `ctx.connection.start()` itself** — the loop stays single-consumer by design.
- **Folding the banner into `ui-layout`** — the frame owner would gain a data-layer concern.
- **Inferring loss from a failed RPC or a stalled stream** — a speculative signal that reports healthy hosts as broken.

## Consequences

- The connection service gains one read-only surface; its lifecycle and single-consumer rule are unchanged.
- `ConnectionHandle` fakes in tests must supply `connectionState` — the two runtime benches were updated with it.
- The banner appears after a host restart, because a new plugin row is part of the profile composition rather than a client bundle reload.

## Verification

`packages/client/ui-connection-status/tests/connection-banner.client.spec.tsx` covers the overlay registration with fiber teardown (HMR safety), both dictionaries and their withdrawal, the inert node half, the invariant companion, and the banner's rendering for `connected`, `reconnecting`, and the not-yet-started phase.
