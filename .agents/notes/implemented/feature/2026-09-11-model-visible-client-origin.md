# Agent Note: the client that sent a prompt is a model-visible fact

Status: implemented

[中文](2026-09-11-model-visible-client-origin.zh.md) | English

## Problem

Nothing on the prompt path says which connection sent a message. The client calls `api.sessions.prompt`, the Host RPC reaches `agent.send`, and `session.append('user/message')` writes the message — carrying its text and its attachments and no trace of the client behind them. So a model asked to act on a phone cannot tell that the person is holding one: it writes desktop instructions, names paths the person cannot reach, and answers at desktop length.

The gap matters more now that one session is driven from two devices at once. A prompt typed on a phone and a prompt typed on a desktop append indistinguishable events, so neither the model nor a reviewer of the log can say which screen an instruction was meant for.

## Decision

**The device class rides the prompt payload, not the transport.** The client samples its own class once per page and sends it on every `sessions.prompt`, exactly as it already sends its browser time zone. `clientTimeZone` is the precedent and the template: a client-declared fact that the Host validates and binds to the exact durable user message, where a request-context plugin can read it later. The transport was rejected as the source.

**Three coarse buckets: `mobile-app`, `mobile-browser`, `desktop-browser`.** That is what a reader can act on — answer for a small screen, or answer for a workstation. No device name, model, or address is collected, because a model that believes a wrong specific is worse off than one that knows nothing. The phone shell is the only client that can know it is an app, so it says so on the URL it loads; a browser reports the coarse screen class its platform exposes; a runtime with no page to classify reports nothing, and the Host records no class rather than inventing a default.

**The Host refuses a value outside the closed set** as `invalid-client-device` before any turn starts, so a producer bug cannot put a fourth bucket into a session log that consumers would then have to interpret.

**The class is stated to the model once per turn**, at the step that opens it, from the durable messages of that turn. `@deepseek-ai/dsh-client-origin` reads them on `agent/pre-step` and injects a plugin-sourced message. A turn whose messages disagree is stated as `mixed` with every class named rather than collapsed to the last writer; a turn that declares nothing injects nothing, which keeps every deployment whose clients report no class byte-identical to before.

## Alternatives considered

- **Deriving the class from the transport** — the RPC layer would have to map one call back to one connection, and every such mapping is another place for the answer to be wrong; it is also not replayable from the session log.
- **A finer-grained device identity (name, model, address)** — a model that believes a wrong specific is worse off than one that knows nothing.
- **A configured default class when a client reports none** — the Host records no class rather than inventing one, so those deployments' requests stay byte-identical.
- **Stating the class once per session instead of once per turn** — one session can be driven from two devices at once, so a session-scoped statement would be wrong for the other device's turns.

## Consequences

What the model is told is exactly what the log can replay: the class is durable on the user message, so a future reader or a rebuilt request sees the same fact, satisfying the model-visible ⟺ logged rule without a second record.

The injection is additive and opt-in by fact rather than by configuration: no client class means no injection, so existing snapshots, headless runs, and ACP traffic are unchanged.

`kind` on the source stays `'user'`: the model face carries no transport vocabulary, and a consumer decides how the class is phrased. A second consumer that wants a different phrasing reads the same field.
