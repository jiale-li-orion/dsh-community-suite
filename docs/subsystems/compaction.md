# Compaction

English | [中文](compaction.zh.md)

The compaction seam — a [capability seam](../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md) split like bash: Service Definition ([dsh-compaction](../../packages/compaction/compaction), `ctx.compaction`), Service Provider (a backend such as [dsh-compaction-basic](../../packages/compaction/compaction-basic)), and human Consumer ([dsh-command-compact](../../packages/compaction/command-compact)). Compaction is **one optional capability**, not part of the agent-loop spine — so its vocabulary lives here, not in [core.md](core.md). A tokenizer- or template-based backend is a sibling package implementing the same interface. Unlike bash, the interface necessarily depends on `dsh-session` and `dsh-llm`: its verbs act on an agent-owned `Session`, and its durable summary event uses the `ContentBlock` vocabulary (see the [compaction capability-seam Agent Note](../../.agents/notes/implemented/feature/2026-06-18-compaction-capability-seam.md)).

Source: [`packages/compaction/compaction/src/types.ts`](../../packages/compaction/compaction/src/types.ts)

## The `compaction/*` session events

Compaction extends [`SessionEventMap`](session.md) with lock, summary, pruning, and reviewed-preparation event types via declaration merging. Every `compaction/*` record is **log-only**: `SurfaceEventType` is deliberately not extended, so a successful summary still enters the model surface through a separate replacement `user/message`. The [Agent Note](../../.agents/notes/implemented/feature/2026-06-18-compaction-capability-seam.md) owns the rationale for reusing `user/message`.

| Event family | Role |
|---|---|
| `compaction/start`, `compaction/summary`, `compaction/end` | Standard lock bracket, safe summary and call envelope, exact shadowed membership and price, and successful or failed close. Optional `preparationId` correlates a reviewed commit. |
| `compaction/prune` | Shadow price immediately preceding one model-free tool-result replacement. |
| `compaction/preparation/requested` | Stable selected-span endpoints, membership, digest, token price, unit count, and optional preservation brief. |
| `compaction/preparation/planned`, `attempted` | Capacity-derived direct or map/reduce strategy, initial chunks, and one exact provider call envelope before streaming starts. |
| `compaction/preparation/call` | One completed direct, map, or reduce provider call with its summary, route, usage, and source chunk indexes. |
| `compaction/preparation/ready`, `edited`, `failed`, `discarded` | Generated chunk plan and summary, latest review edit, terminal preparation failure, or review discard. |

The lock brackets the **whole** operation: `compaction/start` is appended first, then summarization, the `compaction/summary` record, and the `user/message` replacement all land, and only then `compaction/end`. Releasing the lock last turns a crash mid-operation into a detectable orphaned lock (a `compaction/start` with no matching `compaction/end`) rather than a `compaction/end` that falsely claims compaction finished.

The markers are lock time points, not an exclusive container. An unrelated idle injection can appear between a standalone manual start and end while summarization is pending. The manual path revalidates only its selected positional span, so that injected context survives after the replacement checkpoint. A live unmatched start blocks every entry point; an unmatched start before a newer `session/end-seed` is stale evidence from a prior lifecycle and is ignored.

These variants are merged inside a `declare module '@deepseek-ai/dsh-session/types'` block, so — unlike the top-level types on the other subsystem pages — they are not pasted as a drift-checked ` ```ts type-equiv ` block (the `verify-type-equiv` extractor matches only top-level declarations by name). The payload table above is the catalog entry; follow the source link for the authoritative fields.

## `CompactionResult`

What a successful compaction returns to its caller: the bookkeeping-event seqs, safe summary projection, shadowed range and seqs, and estimated token count.

```ts type-equiv
/** Result of a successful compaction operation. */
interface CompactionResult {
  /** Stable identity shared by this compaction's complete durable lifecycle. */
  compactionId: CompactionId
  /** Human command that initiated this compaction, when it was manual. */
  sourceCommandId?: CommandId
  /** The seq of the appended `compaction/start` event. */
  startSeq: number
  /** The seq of the appended `compaction/summary` event. */
  summarySeq: number
  /** The seq of the appended `compaction/end` event. */
  endSeq: number
  /** The summary content blocks produced by the backend. */
  summary: ContentBlock[]
  /**
   * The surface-boundary pair that was shadowed: the seqs of the first
   * (`start`) and last (`end`) surface nodes of the replaced range. A
   * surface-POSITION span, not a numeric seq interval — after a prior replace
   * lands a fresh high-seq summary node at an older range's position, `start`
   * can be GREATER than `end`. {@link CompactionResult.shadowedSeqs} is the
   * authoritative set of shadowed nodes, in surface order.
   */
  shadowedRange: { start: number; end: number }
  /** The seqs of all shadowed surface nodes, in surface order. */
  shadowedSeqs: number[]
  /** Estimated token count of the shadowed content. */
  shadowedTokenCount: number
}
```

## Reviewed preparation types

```ts type-equiv
/** Stable selected-span facts recorded before range summarization starts. */
interface CompactionPreparationRequest {
  preparationId: CompactionPreparationId
  start: number
  end: number
  shadowedSeqs: number[]
  shadowedDigest: string
  shadowedTokenCount: number
  unitCount: number
  preservationBrief?: string
}
```

```ts type-equiv
/** Summarizer stage for one reviewed range preparation request. */
type CompactionPreparationStage = 'direct' | 'map' | 'reduce'
```

```ts type-equiv
/** Capacity-derived plan recorded before a range preparation makes provider calls. */
interface CompactionPreparationPlan {
  strategy: 'direct' | 'map-reduce'
  provider: string
  model: string
  contextWindow: number
  modelMaxOutputTokens?: number
  desiredOutputTokens: number
  outputTokenCap: number
  directInputTokens: number
  inputTokenBudget: number
}
```

```ts type-equiv
/** One deterministic direct, map, or reducer input in a range preparation. */
interface CompactionPreparationChunk {
  index: number
  stage: CompactionPreparationStage
  startSeq: number
  endSeq: number
  part: number
  parts: number
  estimatedTokens: number
  inputDigest: string
}
```

```ts type-equiv
/** One provider call recorded before its stream starts. */
interface CompactionPreparationAttempt {
  index: number
  stage: CompactionPreparationStage
  chunkIndexes: number[]
  inputTokens: number
  provider: string
  model: string
  maxTokens: number
}
```

```ts type-equiv
/** One completed summarizer call, recorded independently of its completion order. */
type CompactionPreparationCall = {
  index: number
  stage: CompactionPreparationStage
  chunkIndexes: number[]
  summary: ContentBlock[]
  provider: string
  model: string
  maxTokens?: number
  usage?: TokenUsage
} & (
  | { rawOutput: ContentBlock[]; llmStreamCall: true }
  | { rawOutput?: ContentBlock[]; llmStreamCall?: never }
)
```

```ts type-equiv
/** Complete generated preparation ready for review or a revalidated commit. */
interface CompactionPreparation {
  request: CompactionPreparationRequest
  chunks: CompactionPreparationChunk[]
  calls: CompactionPreparationCall[]
  summary: ContentBlock[]
}
```

Preparation is durable review state, not a surface mutation. The caller records `requested`, then the capacity plan, each attempt, each completed call, and finally `ready`; edits replace only the review candidate. Direct fit is decided from the complete position-local request plus its dynamic output cap. Commit revalidates the request and uses the ordinary bracket.

## The service

Automatic callers state why policy is running; implementations may treat confirmed overflow more aggressively than ordinary pressure.

```ts type-equiv
/** Why automatic policy is asking a backend to consider compaction. */
type CompactionTrigger = 'pressure' | 'context-overflow'
```

`CompactionEngine` exposes automatic `compactIfNeeded`, idle `compactNow`, explicit `compactRegion`, read-only `prepareRegion`, and revalidated `commitPrepared`. `compactNow()` runs as agent maintenance between turns and writes a standalone `turn: null` bracket. `commitPrepared()` accepts either idle admission or the caller's already-open turn. Every backend creates replacement message sources with `compactCheckpointSource()`. Implementations forward cancellation to provider work. The seam owns no pricing API: [`ctx.tokenMeter`](token-meter.md) owns estimation and positional ranges, while `dsh-compaction-basic` owns retention, event sequencing, direct-fit planning, map/reduce fallback, and configuration.

Providers register with `ctx.compactions`; `CompactionDirectory.resolve(agent)` selects the exact Agent-scoped provider and otherwise uses a process fallback. This lets Session Context commit through the provider mounted by the Agent preset instead of assuming one root implementation.

Expected manual failures use `ManualCompactionErrorCode`:

```ts type-equiv
/** Expected failure classes for an explicit idle-session compaction request. */
type ManualCompactionErrorCode =
  | 'busy'
  | 'cancelled'
  | 'changed'
  | 'summary'
  | 'commit'
  | 'persistence'
```

`changed` and `summary` leave the conversation surface unchanged but still close and persist the failed attempt in the log. `commit` may follow partial mutation; `persistence` means the in-memory bracket closed but its flush failed. Cancellation remains separate and throws the exact abort reason after required cleanup.

Pressure compaction runs at serial `agent/pre-step` before request derivation. Once pressure or canonical overflow qualifies, compaction-basic invokes optional [`ctx.toolResultPruner`](../../packages/compaction/compaction-tool-result-pruner/README.md) before range selection, remeasures through `ctx.tokenMeter`, and can advance the surface without a summary. Failed-request recovery runs through `agent/request-error` after the failed step closes and returns a retry action only when the surface replacement generation advances, even if later summary work throws after pruning; cancellation still wins. Region boundaries preserve tool-call/result pairing but not whole turns, allowing early closed steps of one oversized turn to compact. `dsh-compaction-basic` owns thresholds, retained-tail policy, overflow caps, and failure handling.

The Service Definition exports `toolPairingBalancedBefore(session, seq)` and `toolPairingBalancedAfter(session, seq)` for the tool-call/result pairing checks before and after a seq. Both validate current surface membership and reject missing seqs and orphan results; the [package contract](../../packages/compaction/compaction/README.md#tool-pairing-boundaries) defines their cache behavior.

## Tool-result pruning outcomes

The optional tool-result pruning service reports each durable content replacement and the aggregate Unicode-code-point reduction. Its public result types live in [`compaction-tool-result-pruner/src/types.ts`](../../packages/compaction/compaction-tool-result-pruner/src/types.ts).

```ts type-equiv
/** Cited source event and size accounting for one landed surface replacement. */
interface PrunedEntry {
  /** Full-fidelity tool-result event shadowed by the replacement. */
  readonly originalSeq: number
  /** Newly appended pruned tool-result event. */
  readonly replacementSeq: number
  /** Tool call shared by the original and replacement. */
  readonly callId: CallId
  /** Original text size in Unicode code points. */
  readonly charsBefore: number
  /** Replacement text size in Unicode code points. */
  readonly charsAfter: number
}
```

```ts type-equiv
/** Aggregate outcome of one stable-surface pruning pass. */
interface PruneResult {
  /** Replacements in the snapshotted surface order. */
  readonly pruned: readonly PrunedEntry[]
  /** Total Unicode code points removed across replacements. */
  readonly charsRemoved: number
}
```

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxcompaction--compactionengine-abstract-seam"></a>

### `ctx.compaction` — `CompactionEngine` (abstract seam)

Abstract compaction service. Implementations own trigger policy, retention, and summarization, and may consume a separate measurement service. A successful run replaces the selected surface span with one summary node and prevents concurrent compaction of the same session. The replacement user message uses compactCheckpointSource with the transaction identity so consumers recognize and correlate it independently of the backend. Load one implementation per context as `ctx.compaction`.

```ts cordis-catalog
/**
 * Consider automatic compaction for one explicit trigger. Pressure policy
 * uses the latest durable routed request, while context-overflow policy may
 * force a useful balanced reduction even below the normal threshold. Return
 * `null` when no safe range can be compacted. A single oversized retained
 * unit or request envelope cannot be repaired through surface compaction.
 *
 * @param agent - agent context owning the session surface and routing options.
 * @param trigger - normal pressure or provider-confirmed context overflow.
 * @param signal - cancellation signal; model-backed implementations must forward it.
 * @returns the compaction result, or `null` if no compaction was needed.
 */
abstract compactIfNeeded( agent: CompactionAgentContext, trigger: CompactionTrigger, signal: AbortSignal, ): Promise<CompactionResult | null>

/**
 * Explicitly compact useful history even below automatic pressure thresholds.
 * Implementations synchronously start an idle task before any asynchronous
 * work, select a useful range without writing on a no-op, then
 * append a standalone `compaction/start` before summarization. That durable
 * marker is the compaction lock until one `compaction/end` attempt. Later waking
 * prompts remain accepted in FIFO order and start only after the optional
 * durability checkpoint and idle-task settlement. Context injected while the
 * summary runs may sit between the marker pair; only the selected span must
 * remain stable.
 *
 * @param agent - idle agent whose durable history should be compacted.
 * @param signal - cancellation scoped to this compaction request.
 * @param sourceCommandId - initiating command identity for a manual compaction.
 * @returns the compaction result, or `null` when no safe useful range exists.
 * @throws {@link ManualCompactionError} for expected busy, agent-cancellation,
 * changed-span, summarization/shrink, commit-stage, or persistence failures;
 * an aborted request preserves its exact abort reason. Failed attempts remain
 * visible in the log.
 */
abstract compactNow( agent: ManualCompactAgentContext, signal: AbortSignal, sourceCommandId?: CommandId, ): Promise<CompactionResult | null>

/**
 * Forcibly compact a range of surface nodes into a single summary node.
 * `start` and `end` name an inclusive span by surface position, not numeric seq
 * order; replacements can make visible seqs non-monotonic. Both edges must be
 * balanced so assistant tool calls remain paired with their results. A model-
 * backed implementation forwards cancellation and rejects active, missing,
 * reversed, or unbalanced ranges. The target session is `agent.session`.
 * Its replacement user message must use {@link compactCheckpointSource} with
 * the transaction's `CompactionId`.
 * Use {@link toolPairingBalancedBefore} and {@link toolPairingBalancedAfter}
 * for the edge checks.
 *
 * @param start - first surface seq, inclusive.
 * @param end - last surface seq, inclusive.
 * @param agent - context whose session is mutated and whose routing options guide summarization.
 * @param signal - optional cancellation; model-backed implementations must forward it.
 * @throws when compaction is active or the range is missing, reversed, or unbalanced.
 * @returns the appended event seqs, summary, replaced range, and token accounting.
 */
abstract compactRegion( start: number, end: number, agent: CompactionAgentContext, signal?: AbortSignal, ): Promise<CompactionResult>

/**
 * Summarize one stable selected range without changing the Session surface.
 * The caller records the request before invoking this method and durably
 * records every progress item before review begins.
 * @param request - exact selected span, pricing, digest, and optional preservation brief.
 * @param agent - Agent whose scoped provider and Session own the preparation.
 * @param signal - cancellation forwarded to every provider call.
 * @param onProgress - called for the capacity plan, each call attempt, and each successful completion.
 * @returns deterministic chunks, every call result, and the final generated summary.
 */
abstract prepareRegion( request: CompactionPreparationRequest, agent: CompactionAgentContext, signal: AbortSignal, onProgress: (progress: CompactionPreparationProgress) => Promise<void>, ): Promise<CompactionPreparation>

/**
 * Commit one reviewed preparation through short idle maintenance.
 * Implementations revalidate exact selected membership, digest, balance,
 * token price, and summary shrink before appending the standard bracket.
 * @param preparation - generated preparation and provider-call facts.
 * @param summary - reviewed final summary blocks.
 * @param source - whether generated output or a human/model edit is committed.
 * @param admission - idle human maintenance or the caller's already-open model turn.
 * @param agent - idle Agent whose Session is mutated.
 * @param signal - cancellation for admission and persistence work.
 * @returns the committed standard compaction result.
 */
abstract commitPrepared( preparation: CompactionPreparation, summary: readonly import('@deepseek-ai/dsh-llm').ContentBlock[], source: 'generated' | 'human' | 'model', admission: 'idle' | 'current-turn', agent: ManualCompactAgentContext, signal: AbortSignal, ): Promise<CompactionResult>
```

Types: [CommandId](commands.md) · [ContentBlock](llm-streaming.md)

Source: [`packages/compaction/compaction/src/index.ts:112`](../../packages/compaction/compaction/src/index.ts)

<a id="ctxcompactions--compactiondirectory"></a>

### `ctx.compactions` — `CompactionDirectory`

Global fallback plus per-Agent providers contributed by isolated presets.

```ts cordis-catalog
/**
 * Register one provider for an isolated Agent or as the process fallback.
 * @param provider - compaction implementation contributed by one composition.
 * @param agent - owning Agent when the provider lives in an Agent preset.
 * @returns disposer removing only this exact registration.
 */
register(provider: CompactionEngine, agent?: CompactionAgentContext): () => void

/**
 * Resolve the provider selected by one Agent's composition.
 * @param agent - target Agent.
 * @returns the Agent provider, otherwise the global fallback.
 * @throws when neither composition supplied a provider.
 */
resolve(agent: CompactionAgentContext): CompactionEngine
```

Source: [`packages/compaction/compaction/src/directory.ts:13`](../../packages/compaction/compaction/src/directory.ts)

<a id="ctxtoolresultpruner--toolresultpruner"></a>

### `ctx.toolResultPruner` — `ToolResultPruner`

Deterministic head/middle/tail pruning for current tool-result surface nodes.

```ts cordis-catalog
/**
 * Measure text content in Unicode code points; non-text blocks cost zero.
 * @param blocks - tool-result content to measure.
 * @returns total Unicode code points across text blocks.
 */
measureContent(blocks: readonly ContentBlock[]): number

/**
 * Replace an over-budget text middle while retaining rich-block order.
 * Text slicing is by Unicode code point, not UTF-16 code unit, so a retained
 * boundary cannot split a surrogate pair. Grapheme clusters may still split.
 * @param blocks - original tool-result content.
 * @returns pruned content, or `null` when the text is within budget.
 */
pruneContent(blocks: readonly ContentBlock[]): ContentBlock[] | null

/**
 * Prune every over-budget tool result from one stable current-surface snapshot.
 * Each replacement preserves the complete event data except for `content`,
 * cites the shadowed node so replay can recover the replacement input, and is
 * immediately preceded by a `compaction/prune` shadow-price event pricing the
 * shadowed node through the injected token meter, so pure consumers can
 * subtract it without per-node state.
 * @param session - session whose current surface is rewritten.
 * @returns landed replacements and aggregate Unicode-code-point savings.
 * @throws when the session rejects a replacement; replacements committed
 * earlier in the pass remain durable.
 */
pruneSession(session: Session): PruneResult
```

Types: [ContentBlock](llm-streaming.md) · [Session](session.md)

Source: [`packages/compaction/compaction-tool-result-pruner/src/index.ts:44`](../../packages/compaction/compaction-tool-result-pruner/src/index.ts)
<!-- END GENERATED cordis-surface -->
