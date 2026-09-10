# @deepseek-ai/dsh-client-ui-connection-status

English | [中文](README.zh.md)

Web connection-status owner: contributes one entry to the frame-wide `shell.overlay` list that reports a lost connection and its recovery. The data arrives entirely through the connection plugin's published phase ([`dsh-client-connection`](../connection/README.md)), so this package issues no RPC and holds no state of its own.

The entry renders nothing while the connection is healthy and nothing before the stream loop starts, so the overlay layer stays empty on the normal path. While a generation is dead it shows a status line naming the reconnect. The line is a `status` live region, and the overlay layer is pointer-transparent, so it never blocks the composer beneath it.

A dropped connection is otherwise invisible: the runtime drops generation-scoped interaction state the moment a generation dies and rebuilds the session baseline after reconnect without saying anything, which from a phone on a relayed network is indistinguishable from an application that stopped responding. Reporting the phase is presentation only — every action that could act on a stale connection stays owned by its own plugin, so nothing here re-sends a message, re-approves a request, or installs a plugin on recovery.

Styling uses tokens only; copy goes through the package's own `connection` locale namespace. Lifecycle and disposal follow the [GUI web client architecture note](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.md).

## Model Experience

None, as this package renders one client-side connection phase for a human and touches no prompt, message, schema, stream, or tool result. Reconnection itself is not model-visible: the session log keeps the work the model produced, and a recovered client rebuilds its view from that log.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- **The phase covers one stream generation** — it reports the browser's own connection to the host, not the health of the work running there. A phone that loses its network sees the line; a host that keeps working is unaffected by it, which is the intended distinction.
- **Recovery shows no success state** — the line disappears when the next handshake completes. A user who looked away cannot tell from this entry whether the reconnect took, so a "reconnected" confirmation would need a timestamp and an owner for how long it stays.
