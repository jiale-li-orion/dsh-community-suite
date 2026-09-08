# @deepseek-ai/dsh-workbench

English | [中文](README.zh.md)

The shared workbench state service. One value — whether the workbench column is open and which panel is selected — is the single authority for both planes: browser gestures arrive as Remote calls, the `dsh-tool-workbench` tools write the same value, and every commit emits `workbench/changed`, which the web client consumes through the forwarded-event allowlist. The service also answers the file panel's directory listings, fenced to the calling session's recorded working directory and resolved through the `ctx.fs` capability, so the panel shows exactly the tree the agent operates in. Each file entry carries the media type `contentTypeForPath` chose and the listing names the `fileRoute` that serves its bytes, so the viewer chain and the byte route read one vocabulary.

## Model Experience

None, as this package owns browser view state and a fenced directory read; the model-facing projections live in `dsh-tool-workbench`.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **The fence is the session's recorded working directory** — a session without one cannot list, and a workbench outside any session shows no files until one is current.
- **The view is process-global** — every connected browser and agent sees the same open/selection state; per-client views are deferred until a consumer needs them.
- **The listing is read-only** — editing or creating files from the workbench belongs to a later phase.
- **The media type is extension-based** — a file whose content disagrees with its extension is typed by the name, which is what the browser needs for `Content-Type` and viewer routing.
