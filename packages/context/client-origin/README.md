# @deepseek-ai/dsh-client-origin

English | [中文](README.zh.md)

Tells the model which kind of client sent the prompt of the open turn, so an answer can be written for the screen actually in hand. The class is read from the durable user message rather than from the transport, so what the model is told is exactly what the session log can replay. Decision record: [the client-origin Agent Note](../../../.agents/notes/implemented/feature/2026-09-11-model-visible-client-origin.md).

## What the model is told

One message per turn, at the step that opens it:

```
Client that sent this request: mobile-app. It is the phone app: a small screen, and
the paths it names are the ones it can reach, not the ones this machine can.
```

Three classes exist: `mobile-app`, `mobile-browser`, `desktop-browser`. A turn whose messages declare more than one is stated as `mixed` with every class named, and a turn that declares none is left exactly as the chain decided — a deployment whose clients report no class injects nothing, and nothing is ever guessed. The injection goes out at step 1 only: the class cannot change while its turn is open, and repeating it every step would spend context on a fact that has not moved.

## Where the class comes from

The client samples its own class once per page and sends it with every `session.prompt`. The phone shell says so on the URL it loads (only our own shell can know it is an app); a browser reports the coarse screen class its platform exposes; a runtime with no page to classify reports nothing. The Host validates the value against the closed set, refuses anything else as `invalid-client-device`, and records it on the exact durable user message beside the browser zone and the prompt's `rpcId`. This plugin only reads those messages: it does not read connection state, headers, or addresses, and it stores no device name, model, or address at all.

## Model Experience

### Turn-start client-origin message

#### What the model sees

One user-role message appended after the turn's own messages at the step that opens it: `Client that sent this request: <class>. <guidance>`, where the guidance names only what that class implies. A turn whose messages disagree states `mixed` with every class listed; a turn that declares none adds no message at all.

#### Token effect

One sentence per resolved or mixed turn, added once at the opening step rather than at every step, so a turn of many steps pays it once.

#### KV Cache effect

The message extends the request prefix at the opening step; later steps of that turn reuse the prefix unchanged, and the next turn appends after the previous turn's cached prefix.

## Known Limitations and Deferred Work

- **The class is coarse by design** — three buckets cannot separate a tablet from a phone, and "app" is a flag on the URL the shell loads rather than a detected property.
- **A turn that declares no class is silent** — a reader cannot tell "this client reported nothing" from "this deployment never states a client"; stating `unavailable` for every such request would spend context on turns that need nothing.
- **A mixed turn names the classes, not their messages** — per-message attribution requires reading `clientDevice` on each durable user message.
- **The class cannot change within a turn** — a person who switches devices mid-turn is stated as `mixed` rather than as a change of client.
