/** Client-safe session-context request, response, and durable-source types. */

import type { ContentBlock } from '@deepseek-ai/dsh-llm/types'
import type { ContextRunId } from '@deepseek-ai/dsh-agent/brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  CompactionId,
  CompactionPreparationId,
  CompactionPreparationPlan,
  CompactionResult,
} from '@deepseek-ai/dsh-compaction/types'
import type { ContextRewriteId, ContextUnitId } from './brand.ts'
import type { ContextHistoryCursor } from './brand.ts'

export type { ContextHistoryCursor, ContextRewriteId, ContextUnitId }

/** Session-context service configuration. */
export interface SessionContextConfig {
  /** Maximum grapheme clusters in one unit preview. */
  previewChars?: number
  /** Maximum Context units returned in one inspection page. */
  maxUnitsPerPage?: number
  /** Maximum preparations returned with one Context snapshot. */
  maxPreparations?: number
  /** Maximum grapheme clusters in a preservation brief. */
  maxPreservationBriefChars?: number
  /** Maximum complete wire bytes in one checkpoint-original page. */
  maxHistoryPageBytes?: number
  /** Maximum literal-search input bytes scanned in one request. */
  maxHistorySearchBytes?: number
  /** Maximum matches returned in one literal-search page. */
  maxHistorySearchResults?: number
  /** Maximum grapheme clusters in one literal query. */
  maxHistorySearchQueryChars?: number
}

/** Current-surface unit category used by the Context view. */
export type ContextUnitKind = 'message' | 'tool-exchange' | 'checkpoint'

/** Model-role presentation of one current-surface unit. */
export type ContextUnitRole = 'user' | 'assistant' | 'context'

/** Bounded metadata for one indivisible current-surface unit. */
export interface ContextUnit {
  readonly id: ContextUnitId
  readonly startSeq: number
  readonly endSeq: number
  readonly kind: ContextUnitKind
  readonly role: ContextUnitRole
  readonly tokenCount: number
  readonly preview: string
  readonly time: number
  readonly balanced: boolean
  readonly editable: boolean
  readonly checkpointId?: CompactionId
}

/** Current durable model-surface snapshot for one live Agent. */
export interface ContextSnapshot {
  readonly sessionId: SessionId
  readonly logRevision: number
  readonly replaceGeneration: number
  readonly generationSeq: number | null
  readonly tailSeq: number | null
  readonly totalTokens: number
  readonly surfaceTokens: number
  readonly route?: { readonly provider: string; readonly model: string }
  readonly unitCount: number
  readonly unitOffset: number
  readonly hasEarlierUnits: boolean
  readonly units: readonly ContextUnit[]
  readonly preparations: readonly ContextPreparation[]
}

/** Tail-first page request over the current stable unit list. */
export interface ContextInspectRequest {
  /** Exclusive unit index; omitted reads the current tail. */
  readonly beforeIndex?: number
  /** Requested page size, capped by service configuration. */
  readonly maxUnits?: number
}

/** Durable preparation lifecycle exposed to the Context review UI. */
export type ContextPreparationStatus = 'preparing' | 'ready' | 'failed' | 'discarded' | 'committing' | 'committed'

/** Review-facing projection of one durable range compaction preparation. */
export interface ContextPreparation {
  readonly preparationId: CompactionPreparationId
  readonly status: ContextPreparationStatus
  readonly startSeq: number
  readonly endSeq: number
  readonly unitCount: number
  readonly shadowedTokenCount: number
  readonly preservationBrief?: string
  readonly summary: string
  readonly summarySource: 'generated' | 'human' | 'model'
  readonly plan?: CompactionPreparationPlan
  readonly attemptedCalls?: number
  readonly completedCalls: number
  readonly chunkCount: number
  readonly createdAt: number
  readonly error?: string
  readonly compactionId?: CompactionId
}

/** Remote-safe model message projection without provider-private source state. */
export interface ContextUnitMessage {
  readonly role: 'user' | 'assistant'
  readonly content: ContentBlock[]
}

/** Complete model-visible content represented by one current unit. */
export interface ContextUnitDetail {
  readonly unit: ContextUnit
  readonly messages: readonly ContextUnitMessage[]
}

/** Whether a rewrite retains or supersedes the dependent current suffix. */
export type ContextRewriteMode = 'edit-and-continue' | 'patch'

/** Structured same-Session rewrite request from UI or another trusted consumer. */
export interface ContextRewriteRequest {
  readonly unitId: ContextUnitId
  readonly expectedTailSeq: number
  readonly mode: ContextRewriteMode
  /** Replacement prose; the Host retains image blocks from the selected current message. */
  readonly text: string
  readonly continue: boolean
}

/** Committed rewrite result. */
export interface ContextRewriteResult {
  readonly rewriteId: ContextRewriteId
  readonly replacementSeq: number
  readonly previousGenerationSeq: number | null
  readonly shadowedItemCount: number
  readonly shadowedTokenCount: number
  readonly contextRunId?: ContextRunId
}

/** Request to prepare one contiguous range of current balanced units. */
export interface ContextPrepareRequest {
  readonly startUnitId: ContextUnitId
  readonly endUnitId: ContextUnitId
  readonly preservationBrief?: string
}

/** Review edit of one ready preparation. */
export interface ContextPreparationEditRequest {
  readonly preparationId: CompactionPreparationId
  readonly text: string
  readonly source: 'human' | 'model'
}

/** Address one preparation for discard or commit. */
export interface ContextPreparationRef {
  readonly preparationId: CompactionPreparationId
}

/** Successful preparation commit through the standard compaction lifecycle. */
export type ContextPreparationCommitResult = CompactionResult

/** Bounded read request over one checkpoint's exact shadowed provenance. */
export interface ContextHistoryReadRequest {
  readonly checkpointId: CompactionId
  readonly recursive?: boolean
  readonly cursor?: ContextHistoryCursor
  readonly maxBytes?: number
}

/** One canonical fragment of an original model-visible message. */
export interface ContextHistoryEntry {
  readonly checkpointId: CompactionId
  readonly seq: number
  readonly role: 'user' | 'assistant'
  /** UTF-16 offset in the canonical serialized message. */
  readonly offset: number
  readonly text: string
  readonly complete: boolean
  readonly nestedCheckpointId?: CompactionId
}

/** Bounded checkpoint-original page. */
export interface ContextHistoryReadResult {
  readonly entries: readonly ContextHistoryEntry[]
  readonly nextCursor?: ContextHistoryCursor
  readonly complete: boolean
  readonly returnedBytes: number
}

/** Literal search request over one checkpoint's reachable originals. */
export interface ContextHistorySearchRequest {
  readonly checkpointId: CompactionId
  readonly query: string
  readonly recursive?: boolean
  readonly caseSensitive?: boolean
  readonly cursor?: ContextHistoryCursor
  readonly maxResults?: number
  readonly maxScanBytes?: number
}

/** One checkpoint-addressed literal match. */
export interface ContextHistorySearchMatch {
  readonly checkpointId: CompactionId
  readonly seq: number
  /** UTF-16 offset in the canonical serialized message. */
  readonly offset: number
  readonly snippet: string
  readonly nestedCheckpointId?: CompactionId
}

/** Bounded literal-search page. */
export interface ContextHistorySearchResult {
  readonly matches: readonly ContextHistorySearchMatch[]
  readonly nextCursor?: ContextHistoryCursor
  readonly complete: boolean
  readonly scannedBytes: number
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Committed same-Session context replacement and its exact removed surface nodes. */
    'context/rewrite': {
      rewriteId: ContextRewriteId
      mode: ContextRewriteMode
      replacementSeq: number
      shadowedRange: { start: number; end: number }
      shadowedSeqs: number[]
      shadowedTokenCount: number
      contextRunId?: ContextRunId
    }
  }
}
