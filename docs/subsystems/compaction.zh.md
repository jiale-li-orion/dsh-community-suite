# 压缩（compaction）

[English](compaction.md) | 中文

压缩 seam 是一个[能力 seam](../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md)，与 bash 一样分为 Service Definition（[dsh-compaction](../../packages/compaction/compaction)，`ctx.compaction`）、Service Provider（例如 [dsh-compaction-basic](../../packages/compaction/compaction-basic) 后端）和面向用户的 Consumer（[dsh-command-compact](../../packages/compaction/command-compact)）。压缩是**一项可选能力**，不属于 agent loop（智能体循环）主干，因此其词汇定义在此而非 [core.md](core.md) 中。基于 tokenizer 或模板的后端是实现同一接口的兄弟包。与 bash 不同，该接口必然依赖 `dsh-session` 和 `dsh-llm`：其动词作用于 agent 所有的 `Session`，而其持久摘要事件使用 `ContentBlock` 词汇（见[压缩能力 seam Agent Note](../../.agents/notes/implemented/feature/2026-06-18-compaction-capability-seam.md)）。

源码：[`packages/compaction/compaction/src/types.ts`](../../packages/compaction/compaction/src/types.ts)

## `compaction/*` 会话事件

压缩通过声明合并为 [`SessionEventMap`](session.md) 扩展锁、摘要、剪枝和可评审 preparation 事件类型。每条 `compaction/*` 记录都**仅写入日志**：这里有意不扩展 `SurfaceEventType`，因此成功摘要仍通过另一条替换 `user/message` 进入模型 surface。[Agent Note](../../.agents/notes/implemented/feature/2026-06-18-compaction-capability-seam.md) 负责复用 `user/message` 的决策依据。

| 事件族 | 作用 |
|---|---|
| `compaction/start`、`compaction/summary`、`compaction/end` | 标准锁 bracket、安全摘要与调用 envelope、准确被遮蔽成员和价格，以及成功或失败闭合。可选 `preparationId` 关联评审提交。 |
| `compaction/prune` | 紧邻一次无模型工具结果替换之前的 shadow price。 |
| `compaction/preparation/requested` | 稳定所选 span 端点、成员、digest、token 价格、单元数和可选保留说明。 |
| `compaction/preparation/planned`、`attempted` | 按容量推导的 direct 或 map/reduce 策略、初始分片，以及流开始前的一份准确提供方调用 envelope。 |
| `compaction/preparation/call` | 一次完成的 direct、map 或 reduce 提供方调用，包括摘要、路由、用量和来源分片索引。 |
| `compaction/preparation/ready`、`edited`、`failed`、`discarded` | 生成的分片计划与摘要、最新评审编辑、终态 preparation 失败或评审丢弃。 |

锁括住**整个**操作：先追加 `compaction/start`，然后执行摘要生成、写入 `compaction/summary` 记录与 `user/message` 替换，最后才追加 `compaction/end`。最后释放锁意味着操作中途崩溃会表现为可检测的遗留锁（有 `compaction/start` 而无匹配的 `compaction/end`），而非一个虚假声称压缩已完成的 `compaction/end`。

这些标记表示锁的时间点，而不是排他的容器。摘要等待期间，不相关的空闲注入可以出现在独立的手动 start 与 end 之间。手动路径只重新验证所选位置 span，因此替换检查点之后仍保留该注入上下文。活动的未匹配 start 会阻塞所有入口点；较新 `session/end-seed` 之前的未匹配 start 是先前生命周期留下的陈旧证据，会被忽略。

这些变体在 `declare module '@deepseek-ai/dsh-session/types'` 块内合并，因此——与其他子系统页面上的顶层类型不同——它们不以漂移检查的 ` ```ts type-equiv ` 块粘贴（`verify-type-equiv` 提取器只按名称匹配顶层声明）。上方的载荷表即为目录条目；权威字段请循源码链接查看。

## `CompactionResult`

成功压缩向调用方返回：记账事件 seq、安全摘要投影、被遮蔽的范围与 seq，以及估算 token 数。

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

## 可评审 preparation 类型

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

Preparation 是持久评审状态，而不是 surface 变更。调用方依次记录 `requested`、容量计划、每次尝试、每次完成调用，最后记录 `ready`；编辑只会替换评审候选。系统根据完整位置局部请求及其动态输出上限判断能否直接放入窗口。Commit 会重新校验请求，并使用普通 bracket。

## 服务

自动调用方会说明策略为何运行；实现可以比普通压力更激进地处理已确认的溢出。

```ts type-equiv
/** Why automatic policy is asking a backend to consider compaction. */
type CompactionTrigger = 'pressure' | 'context-overflow'
```

`CompactionEngine` 暴露自动 `compactIfNeeded`、空闲 `compactNow`、显式 `compactRegion`、只读 `prepareRegion` 与重新校验的 `commitPrepared`。`compactNow()` 在轮次之间作为 agent maintenance 运行并写入独立 `turn: null` bracket。`commitPrepared()` 接受空闲准入或调用方已经打开的轮次。每个后端都使用 `compactCheckpointSource()` 创建替换消息来源。实现会把取消转发给提供方工作。该 seam 不拥有计价 API：[`ctx.tokenMeter`](token-meter.md) 负责估算与位置范围，`dsh-compaction-basic` 负责保留、事件顺序、direct-fit 规划、map/reduce fallback 及配置。

提供方会向 `ctx.compactions` 注册；`CompactionDirectory.resolve(agent)` 选择准确 Agent 作用域提供方，否则使用进程 fallback。这样 Session Context 会通过 Agent preset 挂载的提供方提交，而不是假设存在某个根实现。

预期的手动失败使用 `ManualCompactionErrorCode`：

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

`changed` 和 `summary` 保持会话表层不变，但仍会闭合失败尝试并将其持久化到日志。`commit` 可能发生在部分变更之后；`persistence` 表示内存中的标记对已闭合，但 flush 失败。取消独立于这些失败，并在完成必要清理后抛出原始 abort 原因。

压力压缩在串行 `agent/pre-step` 中运行，先于请求推导。一旦压力或规范化溢出满足条件，compaction-basic 会在选择范围前调用可选的 [`ctx.toolResultPruner`](../../packages/compaction/compaction-tool-result-pruner/README.md)，再通过 `ctx.tokenMeter` 重新测量，并且可以在不生成摘要的情况下推进 surface。失败请求的恢复在失败的步骤关闭后通过 `agent/request-error` 运行；仅当 surface replacement generation 前进时才返回重试动作，即便后续摘要工作在剪枝后抛异常亦如此；取消仍然优先。区域边界保持工具调用/结果配对，但不保持整个轮次，因此一个过大轮次中较早关闭的步骤可以被压缩。`dsh-compaction-basic` 拥有阈值、保留尾部策略、溢出上限与失败处理。

该 Service Definition 导出 `toolPairingBalancedBefore(session, seq)` 与 `toolPairingBalancedAfter(session, seq)`，用于检查 seq 之前与之后的工具调用/结果配对。两者都会验证当前 surface 成员关系，并拒绝缺失的 seq 与遗留结果；[包约定](../../packages/compaction/compaction/README.md#tool-pairing-boundaries)定义其缓存行为。

## 工具结果剪枝产出

可选的工具结果剪枝服务会报告每次持久内容替换以及 Unicode code point 的总减少量。其公开结果类型位于 [`compaction-tool-result-pruner/src/types.ts`](../../packages/compaction/compaction-tool-result-pruner/src/types.ts)。

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
