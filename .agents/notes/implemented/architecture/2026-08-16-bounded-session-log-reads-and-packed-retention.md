# Agent Note: Bounded Session log reads and packed retention

Status: implemented

English | [中文](2026-08-16-bounded-session-log-reads-and-packed-retention.zh.md)

## Problem

Session is an append-only logical event log, and model streaming can add millions of token-sized `assistant/chunk` events to one long-running session. The logical events and their contiguous seq values are authoritative, but representing every event as a permanently resident JavaScript object and repeatedly copying the complete array are not semantic requirements.

The former live path conflated those concerns. `Session.events` produced a complete frozen array after each append invalidated its cache, while append-time consumers such as TokenMeter read that array for every streamed event. One hundred appends after a 7.23-million-event prefix therefore implied roughly 723 million copied references before domain work. Cold restore expanded packed JSONL rows into the same object-heavy representation, and history materialized and serialized tens of thousands of transport chunks for a small message page. The resulting CPU allocation, garbage collection, retained memory, and event-loop stalls affected prompt admission, interruption, reload, and `/compact` observation even when the domain operation itself was small.

## Decision

Logical event semantics remain public and stable; bounded reads, private packed retention, and cooperative cold work become the implementation foundation.

### Stable logical log cuts

`Session.readLog()` captures an immutable `SessionLogCut` at the current logical length in O(1). A cut offers validated point reads, forward and reverse ranges, selected-type iteration, semantic chunk-run ranges, and explicit `materialize(from?, to?)`. Appends after capture never extend the cut. `Session.events` remains a compatibility face, but reading it explicitly materializes the complete logical log and is therefore reserved for operations whose result intrinsically requires a complete array.

Live consumers read the smallest sufficient fact. Incremental state uses `SessionEventFold`, which consumes the delivered `session/event` directly, catches up only a missed prefix, advances its watermark only after a successful reducer call, and skips event types outside the reducer's declaration. Point lookups use `at`; reverse searches and projections use selected-type iterators. Projection units declare the same intent through `eventTypes`, refining the drive described by the [session projection proposal](../../proposed/architecture/2026-07-27-session-projection-and-command-log.md). TokenMeter therefore performs constant append work instead of acquiring a complete snapshot for every chunk.

### Private packed retention

Session stores its log in a private `PackedSessionLog`. Eligible consecutive chunk deltas share physical records, while all public reads still observe individual immutable `SessionEvent`s with their original seq values and timestamps. A compact per-type span index lets `valuesOf` and `reverseValuesOf` skip records of unrelated types. Packing, span indexes, and decoded-object caching are implementation details: the logical event API, durable event vocabulary, and `SESSION_FORMAT_VERSION` do not change.

JSONL readers transfer validated storage records into `Session.fromRestoreRecordsAsync()`. Session adopts packed rows without expanding their members and releases each parser-array slot after adoption. Row-oriented backends may still return ordinary events; both representations produce the same logical log. `SessionInspection.log` is the primary immutable read face, while `SessionInspection.events` lazily materializes the complete compatibility array. This decision extends the [packed JSONL layout](2026-07-26-packed-chunk-rows-by-default.md), [large-session restore pipeline](2026-08-05-large-session-jsonl-restore-pipeline.md), and [reusable Session preparation](2026-08-05-session-preparation.md) without making their physical representations public contracts.

### Cooperative cold work

Cold work that must inspect the complete artifact periodically yields to the host event loop. Zstandard frame traversal, plaintext and torn-frame JSONL scanning, storage-record admission, and worst-case attachment authorization scans use elapsed CPU budgets rather than fixed record counts. A single native codec operation or `JSON.parse` remains indivisible, so the policy bounds uninterrupted work between natural boundaries rather than promising a hard wall-clock deadline.

### Bounded history projection

`session.history` captures one stable cut, locates the page by reverse selected-type iteration, and materializes only that contiguous durable range. The wire response then projects transport detail that the completed conversation no longer needs: a completed Assistant stream retains its first token-bearing delta, usage chunks, and final message; unfinished delta runs coalesce adjacent fragments while preserving token and visible-content timing boundaries. `HistoryEntry.firstSeq` records the first durable seq represented when `event.seq` is the last, so pagination, reconnect repair, and the unmodified live tail retain exact sequence coverage.

### Attribution before more instrumentation

The optimized `/compact` trace separates local admission, provider summarization, and local settlement. On the measured long session, admission took 7 ms, provider work 30.179 seconds, and commit plus settlement 4 ms while concurrent static requests remained responsive. The remaining command duration is therefore provider latency, not evidence for moving Session work to another execution model. HTTP 408 did not reproduce after the local stalls were removed; issuer-level deadline instrumentation is added only if the symptom recurs with a concrete failing carrier.

## Verification

The reference 7.41-million-event log retains approximately 82,800 private records instead of one object per logical event. A default history response fell from approximately 10.68 MiB and 61,343 events to approximately 843 KiB of sequence-span-preserving entries. Cold JSONL inspection fell from 16.96 seconds to approximately 3.0 seconds, and cold rename from 24.948 seconds to 7.465 seconds. During cooperative restore, the maximum sampled static-request latency fell from 3,317 ms with 49 of 144 requests above one second to 810 ms with none of 145 above one second; after warm-up, static-request p95 was 172 ms and the maximum was 274 ms.

Tests pin stable-cut immutability and range validation, packed and expanded equivalence, sparse type reads, chunk-run boundaries, restore slot release and yielding, fold retry semantics, projection watermarks, history sequence spans, incomplete-stream timing, fork and attachment authorization, HMR adoption, persistence repair, and client pagination plus live-tail stitching.

## Alternatives considered

**Keep a complete event array and improve its snapshot cache.** Rejected because every append invalidates the complete snapshot, while permanently retaining millions of event objects remains the dominant memory cost even if copying frequency falls. A stable cut states the actual read requirement and lets storage evolve independently.

**Move Session restoration and folds to a worker thread.** Rejected as the primary design because a live Session and its plugin state cannot cross the thread boundary. Structured-cloning millions of events back to the host recreates the expansion, allocation, and memory pressure being removed; rebuilding every consumer in the worker would move product ownership across process-like messaging. A codec may use a worker in the future if one indivisible codec operation becomes dominant, but bounded host-thread work and packed ownership solve the measured bottlenecks without duplicating Session state.

**Coalesce or delete chunk events from the logical log.** Rejected because chunk seq values, live delivery, message provenance, timing, cancellation evidence, and replay fidelity are durable semantics. Physical packing and history projection remove representation cost without changing those facts.

**Add consumer-specific whole-log caches.** Rejected because they duplicate watermarks and invalidation rules, retain multiple derived representations, and leave new consumers likely to repeat the same error. `SessionLogCut`, selected-type indexes, and `SessionEventFold` are shared primitives with explicit cost.

**Raise timeouts or add broad request timing before changing the data path.** Rejected because longer deadlines do not reduce CPU monopolization or payload size. Profiles and durable event timestamps already identified the local and provider phases; instrumentation follows an unexplained residual symptom rather than substituting for removing known work.

## Consequences

Operations proportional to the requested range or relevant event types no longer become proportional to total session length. Append-time reducers stay constant with log size, cold restoration remains event-loop cooperative, and the active Session retains compressed chunk runs without changing logical replay.

The cost becomes explicit. A consumer that calls `materialize()` or reads `Session.events` pays for every selected logical event, and random reads of packed chunks may allocate decoded event objects. The private log and indexes add implementation complexity inside `dsh-session`, while consumers become simpler because they express point, range, type, or fold intent instead of managing snapshots.

Cooperative yielding improves responsiveness but does not reduce the total CPU required to validate a cold artifact, and one codec frame or JSON record can still exceed the target interval. History is a transport projection rather than a byte-for-byte copy of the durable range; consumers that need the canonical ledger use persistence export or an explicit complete logical read.
