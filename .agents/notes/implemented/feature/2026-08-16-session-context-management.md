# Agent Note: Session context management — generations, range compaction, rewrite, and recall

Status: implemented

English | [中文](2026-08-16-session-context-management.zh.md)

## Problem

The append-only Session log preserves every durable fact, while the Session surface selects the messages used by the next model request. Chat exposes the append-origin human record and Trajectory exposes the execution ledger, but neither tells a user which messages still occupy the current model context or supports changing that context without deleting history.

Forking is appropriate when two independently addressable Agents should continue. It is excessive for correcting an earlier prompt and continuing under the same Session identity. Replacing only that prompt while silently retaining answers produced from its prior value is also unsafe because it creates a causally inconsistent active context.

Compaction retains shadowed events in the log, but its provider work and surface mutation previously formed one operation with no durable review state. A human could not inspect or edit a generated summary before it replaced the selected history, and neither people nor models had a bounded path back to exact shadowed messages.

## Decision

Session context management is one capability over the append-only log. Chat remains the complete append-origin transcript, Context shows the exact durable conversation surface used by the next request, and Trajectory remains the complete execution ledger. Context changes append replacement and lifecycle events; they never edit or delete prior records.

### Stable context snapshots

`Session.readSurface()` captures an immutable `SessionSurfaceCut`: one stable `SessionLogCut`, its logical revision, the current replacement count and replacement seq, and a frozen ordered list of current surface seqs. Later appends extend neither the log reader nor the node list. Repeated reads reuse the cut until the next append.

`ctx.sessionContext.inspect(agent, request)` groups that surface into tool-balanced units. A unit cannot split an assistant tool call from its results. The response contains bounded previews, positional token prices, routed provider/model metadata, the total unit count, and a tail-first page. `readUnit()` point-reads the complete messages of one current unit and rejects a stale identity.

The generation is derived state rather than another transcript. The initial surface is generation zero; every positional replacement increments `replaceGeneration` and records its replacement event in `generationSeq`. Log replay reconstructs the same sequence of generations.

### Same-Session rewrite and continuation

Only user-authored messages and prior session-context rewrites are editable. The Host retains authorized image blocks and accepts replacement prose from the client.

`edit-and-continue` replaces the selected unit through the current surface tail. The dependent continuation remains in Chat and Trajectory but leaves the active model surface. `patch` replaces only the selected balanced unit and retains the suffix; the UI requires explicit acknowledgement that later replies were produced from the prior value.

Both modes validate the selected unit and expected tail under idle Agent maintenance, append a replacement `user/message`, append `context/rewrite` with the exact shadowed membership and token price, and flush before returning. Files, subprocesses, approvals, jobs, goals, settings, credentials, and other external state are not rolled back.

Continuation never fabricates a user message such as `continue`. `ContextRunAgent.runFromContext()` appends a durable `agent/context-run/requested` record and queues one no-new-message turn against the committed replacement generation. The loop claims or cancels that request durably, preserves its ordering ahead of later queued turns, restores an unclaimed request after restart, and cancels a stale restored request without opening an empty turn.

### Reviewed range compaction

A range compaction has two durable phases. Preparation records the selected endpoints, ordered membership digest, token price, unit count, preservation brief, model-capacity plan, deterministic direct or map/reduce chunks, every call attempt, every successful provider call, and the generated summary. It leaves the surface unchanged, survives reconnect, and can be edited, regenerated, discarded, or committed.

Preparation resolves the exact summarization model's combined context window and maximum output capability. Its default output target is `min(128k, max(16k, ceil(selectedTokens / 4)))`, capped by that model capability. The complete position-local request uses one `direct` call whenever its instruction, input, and output cap fit; only an oversized request uses capacity-derived map chunks and bounded-concurrency reduction. The position-local prompt records outcomes, decisions and constraints, artifacts and state changes, commands and errors, background facts, open threads originating in the range, and literal anchors. It does not infer the conversation's global current task from a middle span.

Commit is a short revalidated operation. It requires the same current endpoints, ordered membership, digest, token price, tool balance, and a framed summary smaller than the selected content. It then uses the standard `compaction/start` → `compaction/summary` → replacement checkpoint → `compaction/end` bracket and flushes before releasing idle admission. Appends outside the selected span remain valid; any mutation inside it makes the preparation stale.

`CompactionDirectory` resolves the provider selected by the exact Agent composition, with a process-level fallback for non-isolated deployments. Human range review and the model-facing preparation tools use the same preparation/commit API. Automatic pressure, overflow recovery, and `/compact` continue to select their own ranges while sharing the same standard bracket, tool-balance rules, checkpoint source, token meter, and selected-span validation primitives.

### Checkpoint recall

`historyRead()` and `historySearch()` traverse `compaction/summary.shadowedSeqs`, optionally entering nested checkpoints. They read one stable log cut, reject missing or duplicate checkpoint identities, preserve existing attachment references, and never require a sidecar history store.

Recall text is assembled from borrowed message block pieces rather than by serializing the complete message for every page. Reads enforce a complete response-byte limit and split only at grapheme boundaries. Search scans a bounded UTF-8 prefix, preserves Unicode scalar boundaries and cross-page literal overlap, and binds its opaque cursor to the checkpoint, recursion choice, operation, query, and case mode. Reusing a cursor for another query fails.

The Web detail panel exposes the same recursive read and literal search. The model-facing `history_read` and `history_search` tools return ordinary tool results, so recalled content joins the append-only tail through the normal model-visible path.

### Product and package ownership

The Web conversation ring places Context between Chat and Trajectory. The Context view virtualizes the current units, pages older units, displays conversation/system/tool token estimates, reviews prepared summaries, edits current messages, and recalls checkpoint originals. Every row has an explicit selection control; ranges remain contiguous, and the selection footer can extend the first selected unit through the current tail. Every editable user prompt has a direct edit action, while assistant messages, background injections, checkpoints, and tool exchanges remain read-only. Preparation admission, live progress, failure diagnostics, editing, regeneration, and commit stay in one scroll-bounded modal with fixed actions. Closing it retains the durable preparation and local draft; a header action reopens it without changing the list position. An older page is prepended only when its generation and unit interval still join the loaded tail; concurrent context changes trigger a fresh tail read. Chat renders a durable rewrite marker, and Trajectory renders preparation, rewrite, and context-run lifecycle records.

`@deepseek-ai/dsh-session-context` owns the Host service and generated Remote API. `@deepseek-ai/dsh-tool-session-context` owns the model tools. `@deepseek-ai/dsh-client-ui-context` owns the Context view and rewrite marker. Core Session owns stable cuts and generation state; Agent/AgentLoop own context-run admission; the compaction packages own provider-neutral preparation records and the basic map/reduce provider.

### Performance contract

Inspection and mutation never read `Session.events`, materialize the complete logical log, or decode unrelated packed chunks. Unit discovery uses the stable surface cut and cached tool-balance positions. Token reads use `measureRange()` and copy only the displayed or selected positions. Preparation and commit are proportional to the selected range; unrelated retained context is excluded, and direct-fit selections make one provider call. Recall work is proportional to the returned or scanned byte budget rather than the complete shadowed message.

A 50,000-unit synthetic surface returns the last 200 units as a 44,840-byte snapshot in 91.30 ms and point-reads one unit in 2.58 ms. Twenty 64 KiB pages over one 16 MiB original return 1,303,435 bytes in 175.78 ms; seventeen 1 MiB search pages reach a literal at the tail in 48.78 ms total.

## Verification

Unit and composition coverage pins stable cuts, generation replay, range pricing, tool balance, direct-fit planning, map/reduce fallback, durable attempts, preparation recovery, stale commit rejection, image retention, durable context-run ordering and restart, Unicode-safe recall, query-bound cursors, Remote generation, plugin disposal, and Context controller races. A built Web snapshot reopens the durable review modal, then drives summary commit, checkpoint read/search, edit-and-continue, the Chat marker, and the replayed model response through the shipped composition.

## Alternatives considered

**Add start/end arguments to `/compact`.** Command text is an untyped transport for opaque current-unit identities and cannot own interactive review, rewrite, or recall. `/compact` remains one human consumer of the compaction capability.

**Delete or rewrite old log records.** Mutation would destroy request reconstruction, audit, attachment provenance, and human history. Surface replacement expresses the active-context change while retaining durable facts.

**Fork for every correction.** Fork remains the operation for another live Agent or execution world. Same-Session rewrite avoids list, title, navigation, and lifecycle overhead for an ordinary correction.

**Patch one message and always retain its suffix.** Later replies may depend on the old message. Patch remains explicit and risk-confirmed; edit-and-continue is the safe default.

**Wake the loop with a fabricated user message.** A hidden instruction changes the request and attributes text to the user. Durable context-run work authorizes a request from the committed generation without adding words.

**Ship a second recallable compaction backend with frozen index stubs and one mutable state checkpoint.** The [rejected design](../../rejected/feature/2026-07-06-recallable-compaction.md) makes reachability depend on another retention algorithm and permanently grows the prompt with an index. Exact provenance and recall apply to every standard checkpoint and belong in the shared context capability.

**Derive Context from the paged Chat window.** Chat preserves shadowed append-origin history and may omit older pages. Context must derive from the authoritative current Session surface.

**Send the whole conversation prefix for every selected-range summary.** Middle-span work would scale with unrelated retained history and invite global-state claims the replacement does not own. Position-local documents keep cost and semantics proportional to the selected range.

**Always split reviewed ranges into fixed-size map/reduce calls.** A fixed chunk size ignores the selected model's actual capacity, multiplies calls that already fit, and can truncate a detail-heavy map output under an unrelated small cap. Model metadata decides direct fit; map/reduce exists only for requests that exceed that exact window.

## Consequences

Users can inspect and deliberately change the model's active history without losing Chat or Trajectory evidence. Summary review no longer holds turn admission during provider work, and exact originals remain available after repeated compaction. The model can perform the same bounded inspection, preparation, commit, and recall through tools.

The cost is additional durable lifecycle vocabulary, a Host Remote capability, another Web view, model-capability metadata, and more explicit stale-state handling. A rewrite cannot undo external effects. A reviewed summary can still omit information, so original recall and preservation briefs reduce risk without making compaction lossless. Selections that exceed the summarization model still require several provider calls; bounded concurrency limits active work but does not eliminate provider latency. Current recall is literal and in-session; semantic or cross-session retrieval requires a separate decision.
