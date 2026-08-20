# `@deepseek-ai/dsh-session-context`

English | [中文](README.zh.md)

Host service for inspecting and changing the exact current model-visible Session surface. It derives Context from `Session.readSurface()`, never from the paged human transcript, and retains every superseded message in the append-only log.

The [Session context-management decision](../../../.agents/notes/implemented/feature/2026-08-16-session-context-management.md) owns the rationale and cross-package lifecycle.

## Configuration

| Field | Default | Meaning |
|---|---:|---|
| `previewChars` | `160` | Maximum grapheme clusters in one unit preview. |
| `maxUnitsPerPage` | `200` | Maximum current units returned by one inspection page. |
| `maxPreparations` | `8` | Maximum recent preparation projections returned with a snapshot. |
| `maxPreservationBriefChars` | `2000` | Maximum grapheme clusters in a range-preservation brief. |
| `maxHistoryPageBytes` | `65536` | Maximum complete JSON bytes in one checkpoint-original read response. |
| `maxHistorySearchBytes` | `1048576` | Maximum original UTF-8 bytes scanned by one search request. |
| `maxHistorySearchResults` | `50` | Maximum literal matches returned by one search request. |
| `maxHistorySearchQueryChars` | `512` | Maximum grapheme clusters in one literal query. |

## Service API

`ctx.sessionContext` addresses one live Agent and exports generated Typert Host and Client Remote contributions.

- `inspect(agent, request, signal)` captures one stable surface cut and returns a tail-first page of tool-balanced units, token totals, route metadata, generation state, and recent durable preparations. `beforeIndex` is an exclusive unit position; `maxUnits` is capped by configuration.
- `readUnit(agent, unitId, signal)` returns complete messages for one current unit. It rejects a stale, shadowed, malformed, or open tool-exchange identity.
- `rewrite(agent, request, signal)` performs an idle same-Session replacement. `edit-and-continue` shadows the selected unit through the current tail; `patch` shadows only that unit. The request must name the loaded tail, and only user-authored or prior context-rewrite messages are editable. The Host retains image blocks and replaces prose.
- `prepare(agent, request, signal)` durably records one selected balanced range, the exact model-capacity plan, every call attempt, and every completed direct or map/reduce call without changing the surface. Failed review projections distinguish attempted from completed calls. Only one preparing, ready, or committing preparation may be active.
- `editPreparation()`, `discardPreparation()`, and `commitPreparation()` update, discard, or commit the durable review state. Commit revalidates membership, digest, price, tool balance, and summary shrink under short idle maintenance, then flushes the standard compaction bracket.
- `commitPreparationInTurn()` performs the same revalidated commit inside a model tool's already-open turn.
- `historyRead()` recursively renders exact messages shadowed by one checkpoint under a complete response-byte bound. The opaque cursor is valid only for the same checkpoint, recursion mode, and read operation.
- `historySearch()` performs bounded literal search over the same provenance. Its cursor is additionally bound to the query and case mode, so it cannot be reused for another search.

Missing or duplicated checkpoint identities, malformed lifecycle ordering, stale units, stale range preparations, unsupported Agent drivers, and invalid bounds fail loud. Cancellation is checked before mutation and around cooperative inspection or recall yields.

## Context units and generations

Units follow current surface order and end only at tool-balanced cuts. A user or assistant message commonly forms one unit; an assistant tool call and all corresponding results form one indivisible `tool-exchange`; a compaction replacement is a `checkpoint` unit.

Unit ids encode their endpoint seqs plus a digest of exact ordered membership. They remain stable across unrelated log-only appends and change when the represented surface membership changes.

`replaceGeneration` increments on every positional surface replacement. `generationSeq` is the replacement event that created the current generation, or `null` for the initial generation. These values are replay-derived and do not create another durable transcript.

## Durability and authority

Rewrites and compactions append replacement messages plus correlated lifecycle facts. They do not remove prior messages, undo filesystem or process effects, or rewrite Chat. `edit-and-continue` flushes the replacement before queuing a durable context run; the AgentLoop derives the next request directly from that generation without appending a fabricated user prompt.

Checkpoint recall resolves only seqs cited by durable `compaction/summary` records in the addressed Session. Attachment references remain the original authorized values; this service does not add a cross-Session read path or a second history store.

## Performance

Inspection uses a cached `SessionSurfaceCut`, cached tool-balance positions, selected event point reads, and `TokenMeter.measureRange()`. It does not access `Session.events`, decode unrelated packed chunks, or copy every priced surface node for a bounded page.

Range preparation and commit copy only selected positions. Recall assembles canonical readable text from borrowed content-block pieces, splits reads at grapheme boundaries, scans search pages at Unicode scalar boundaries, and yields cooperatively during long operations.

## Model Experience

### Same-Session rewrite

#### What the model sees

The next request sees the replacement user-role message at the selected surface position. `edit-and-continue` omits the dependent suffix; `patch` retains it. No synthetic continuation text is added.

#### Token effect

The replacement's estimated price substitutes for the exact shadowed nodes. Later model output appends normally, and `shadowedTokenCount` reports the removed estimate.

#### KV Cache effect

Reuse remains possible before the first replaced message and is invalidated from that position. Patch retains suffix content but still requires it to be reprocessed after the changed prefix.

### Reviewed range compaction

#### What the model sees

Preparation changes nothing. Commit replaces the reviewed range with the standard framed compaction checkpoint; later context remains after it and wins on conflict.

#### Token effect

Preparation uses one direct auxiliary call when the complete selected request and dynamic output cap fit the summarization model; only an oversized request uses map/reduce. A successful commit requires the framed checkpoint to estimate smaller than the selected range and reduces future conversation-history input by that difference.

#### KV Cache effect

Preparation is an independent request. Commit preserves reuse before the range and invalidates the conversation request from the range start.

### Checkpoint recall

#### What the model sees

The service itself adds no request content. A tool consumer may return selected exact originals as an ordinary tool result at the context tail.

#### Token effect

Zero direct tokens from Host reads. A consumer that sends recalled content to the model pays for only the returned bounded result.

#### KV Cache effect

Host reads do not affect cache state. Recalled tool results append after the existing request prefix.

## Known Limitations and Deferred Work

- **Live Agent required** — Remote lookup addresses an Agent-backed Session; this service does not inspect an arbitrary persisted-but-unloaded log directly.
- **Literal in-session recall only** — search has no regex, semantic ranking, or cross-session index.
- **Heuristic surface prices** — unit and shadowed token counts use the shared fixed estimator when authoritative provider usage cannot price individual nodes.
- **External effects remain current** — rewriting model context does not restore files, processes, network state, approvals, jobs, or goals.
