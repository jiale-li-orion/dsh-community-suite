# Agent Note: Workbench bytes stream over one fenced route, and viewers are a chain seat

Status: implemented

English | [中文](2026-09-09-workbench-bytes-and-viewers.zh.md)

## Problem

The file panel could list a workspace directory but not show a file: the only byte path in the harness was the attachment RPC, which returns base64 for a whole image, and the community media projects both got this wrong in opposite ways. `dsh-media-preview` implements correct Range/206/416 semantics but serves the *whole filesystem* behind its trust fence (`notes/dsh-media-preview.md:6`); `dsh-music-player` claims streaming while reading the entire file into memory before slicing it, one heap copy per request (`notes/dsh-music-player.md:91`). ADR-4 fixed the decision — stream over a `webServer` route, fence through `ctx.fs`, apply the browser trust fence — but nothing implemented it.

## Decision

**One host route serves workspace bytes, fenced twice.** `@deepseek-ai/dsh-workbench-bytes` registers the `webServer` prefix `/workbench/file`. A request first passes the browser trust fence through a new `HostConnectionService.isTrustedRequest(request)`, which applies the deployment's configured `trustedHosts` — the same policy the `/api` bridge uses, exposed as a public method so a second route owner does not restate it or need a second config knob. It then passes `fenceSessionPath`, the same session-`cwd` fence the panel's listing uses, now shared by both callers in `@deepseek-ai/dsh-workbench`. Only then does `createReadStream` open the resolved target's process path.

**Range handling is a pure function.** `parseRange(header, size)` returns `full` / `partial` / `unsatisfiable`; the route answers `206` with `content-range`, `416` with `bytes */<size>`, and `HEAD` with headers alone. A malformed, multi-range, or unknown-unit header is ignored and the whole representation is served, which RFC 9110 allows and which costs a retry instead of a refusal.

**The media type has one home.** `contentTypeForPath` lives with the workbench domain, and `listDir` tags every file entry with it. The byte route serves it as `Content-Type`; the viewer chain routes on it; the browser never re-derives a type from a name. The route's own location is likewise one constant, `WORKBENCH_FILE_PATH`, reported to clients as `WorkbenchListing.fileRoute`, so the client builds URLs from the host's value rather than a duplicated literal.

**The viewer is a chain seat the shell owns.** The `workbench` registration declares `workbench.viewer` (chain) beside `workbench.panel` (list). `@deepseek-ai/dsh-client-ui-workbench` registers one entry per media family — `image/*`, `audio/*`, `video/*` — whose pure selector elects the listing's `mediaType`; a type nothing elects renders the shell's no-preview notice. A panel asks for a preview by writing the file into the shell store through the injected controller, so any panel reuses the seat and no panel declares a slot of its own.

**Preview selection stays browser-local.** Which file a window is looking at never crosses the Remote boundary; only the column's open state and the panel choice are host-owned, because those are the facts the agent shares.

## Alternatives considered

- **Serve bytes over the existing `/api` RPC.** Rejected: the attachment path proves the cost — base64 in a JSON envelope means one full copy in memory and no Range, so a video cannot seek.
- **Register the route under `/api` and inherit its fence.** Rejected: the webserver matches longest prefix first, so a longer `/api/...` prefix would win and silently bypass the connection plugin's handler; inheriting the fence by proximity is not inheriting it.
- **Duplicate the trust fence in the route package.** Rejected: `trustedHosts` is a deployment fact, and two copies would drift or force the operator to configure it twice. Exposing the existing decision on the connection service keeps one policy.
- **Put the viewer inside the file panel as its own child slot.** Rejected: a slot name is global, so the first panel declaring `workbench.viewer` would block every other panel; the shell owns the seat and panels request previews.
- **Send the file path over RPC and let the browser fetch a `file://` URL.** Rejected: the browser cannot read host paths, and it would move the fence to the client.
- **Match viewers on file extension in the browser.** Rejected: it duplicates the host's map and lets the two disagree about what a file is.

## Consequences

A video seeks, a large image loads progressively, and a file outside the session workspace is unreachable from the browser. The two fences are independent: the trust fence bounds *who* may ask, the workspace fence bounds *what* may be served, and each is tested through a real socket. `Range` support costs one pure parser and its matrix test; multi-range responses are deliberately not implemented because no viewer issues them.

## Testing

`packages/workbench/workbench-bytes/tests/range.spec.ts` pins the range matrix (closed, open-ended, suffix, clamped, unsatisfiable, malformed, multi-range, zero-length) and `tests/route.spec.ts` drives the registered route through a real `WebServer` on an OS-assigned port: whole-file and ranged reads, `HEAD`, `416`, `400`, `405`, both `403` fences, `404`, the size-less chunked path, and a stream failure after the headers. `packages/workbench/workbench/tests/workbench.spec.ts` covers the listing's media types, the fence helper, and the invariant's failure arm. `packages/client/ui-workbench/tests/*` cover the store, the shell's viewer dispatch and fallback, the three viewers' selectors and elements, the file panel's preview request, and the registrations' teardown. `pnpm run test:gui` and the `DSH_SNAPSHOT=replay` web lane cover the assembled browser.
