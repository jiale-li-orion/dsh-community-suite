# @deepseek-ai/dsh-workbench-bytes

English | [中文](README.zh.md)

The workbench byte route: one `webServer` prefix (`/workbench/file`) that streams a workspace file to the browser for the file panel's viewer. A request carries the session id and the path; the route passes the browser trust fence (`connection.isTrustedRequest`, which applies the deployment's `trustedHosts` policy) and the workspace fence (`dsh-workbench`'s `fenceSessionPath`, the same one the panel's listing uses), then streams from the resolved target's process path with `createReadStream`. `Range` requests are served as `206` with a `content-range`, an unsatisfiable range as `416`, and `HEAD` returns the headers without a body, so a video seeks and a large image loads without holding the file in memory.

## Uploads and ingest records

`POST /workbench/upload` accepts a file body and query parameters `sessionId`, `name`, and optional `device` and `ingestId`. The same browser trust check and workspace fence apply; files land in `uploads/<device>/`, using `unknown` when no source is declared. `maxUploadBytes` bounds the body, defaulting to 64 MiB. An upload returns its path and byte count without creating a user message.

A successful upload carrying `ingestId` records its path, byte count, SHA-256, client class, and receipt time in `uploads/.dsh/ingest.json`. A sequential retry of a completed request returns that record with `repeat: true` without reading the retry body. IDs are data keys, including `constructor` and `__proto__`. Disk records must have valid fields and a relative path within the intake directory before replay; invalid entries are ignored while other valid entries survive. A missing or unreadable index starts empty, which can make a retry create another file and is not a crash-recovery guarantee.

## Model Experience

None, as this package serves browser bytes; the model-facing workbench projections live in `dsh-tool-workbench`.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **One range per request** — a multi-range header is ignored and the whole representation is served, because the viewers issue single ranges and multipart/byteranges responses would add a boundary encoder with no consumer.
- **Ingest recovery** — concurrent requests are not serialized by ID, and the file and index do not commit transactionally; completed records do not revalidate moved or modified files. MIME validation and expiration cleanup are not implemented.
- **The fence is the session's recorded working directory** — a session without one cannot be served, and a path outside it is refused with `403`.
