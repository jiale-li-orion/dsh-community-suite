# @deepseek-ai/dsh-client-origin

English | [中文](README.zh.md)

Tells the model which kind of client sent the prompt of the open turn, so an answer can be written for the screen actually in hand. The class is read from the durable user message rather than from the transport, so what the model is told is exactly what the session log can replay. Decision record: [the client-origin Agent Note](../../../.agents/notes/implemented/feature/2026-09-11-model-visible-client-origin.md).

## What the model is told

One message per turn, at the step that opens it:

```
Client that sent this request: mobile-app. Answer for that client: a phone app has a
small screen, and the paths it names are the ones it can reach, not the ones this
machine can.
```

Three classes exist: `mobile-app`, `mobile-browser`, `desktop-browser`. A turn whose messages declare more than one is stated as `mixed` with every class named, and a turn that declares none is left exactly as the chain decided — a deployment whose clients report no class injects nothing, and nothing is ever guessed. The injection goes out at step 1 only: the class cannot change while its turn is open, and repeating it every step would spend context on a fact that has not moved.

## Where the class comes from

The client samples its own class once per page and sends it with every `session.prompt`. The phone shell says so on the URL it loads (only our own shell can know it is an app); a browser reports the coarse screen class its platform exposes; a runtime with no page to classify reports nothing. The Host validates the value against the closed set, refuses anything else as `invalid-client-device`, and records it on the exact durable user message beside the browser zone and the prompt's `rpcId`. This plugin only reads those messages: it does not read connection state, headers, or addresses, and it stores no device name, model, or address at all.
