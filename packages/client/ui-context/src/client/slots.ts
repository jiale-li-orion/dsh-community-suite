/** Slot props and injected faces for the Session Context UI. */

import type {
  InjectFace,
  HostObservable,
  PropsLocale,
  PropsRuntime,
  PropsStore,
} from '@deepseek-ai/dsh-client-ui-slots'
import type {
  ContextRewriteMode,
  ContextRewriteResult,
  ContextPrepareRequest,
  ContextHistoryReadRequest,
  ContextHistoryReadResult,
  ContextHistorySearchResult,
  ContextPreparation,
  ContextPreparationCommitResult,
  ContextPreparationEditRequest,
  ContextPreparationRef,
  ContextSnapshot,
  ContextUnitDetail,
  ContextUnitId,
} from '@deepseek-ai/dsh-session-context/types'
import type { ContextActionResult, ContextControllerView } from './controller.ts'
import type { createContextViewStore } from './store.ts'

/** Business callbacks and observable output injected into the Context view. */
export interface ContextViewInjected {
  hooks: { context: HostObservable<ContextControllerView> }
  activate: () => () => void
  refresh: () => Promise<ContextActionResult<ContextSnapshot>>
  loadEarlier: () => Promise<ContextActionResult<ContextSnapshot>>
  readUnit: (unitId: ContextUnitId) => Promise<ContextActionResult<ContextUnitDetail>>
  rewrite: (request: {
    unitId: ContextUnitId
    text: string
    mode: ContextRewriteMode
    continue: boolean
  }) => Promise<ContextActionResult<ContextRewriteResult>>
  prepare: (request: ContextPrepareRequest) => Promise<ContextActionResult<ContextPreparation>>
  editPreparation: (request: ContextPreparationEditRequest) => Promise<ContextActionResult<ContextPreparation>>
  discardPreparation: (request: ContextPreparationRef) => Promise<ContextActionResult<{ discarded: true }>>
  commitPreparation: (request: ContextPreparationRef) => Promise<ContextActionResult<ContextPreparationCommitResult>>
  readHistory: (
    checkpointId: ContextHistoryReadRequest['checkpointId'],
    more?: boolean,
  ) => Promise<ContextActionResult<ContextHistoryReadResult>>
  searchHistory: (
    checkpointId: ContextHistoryReadRequest['checkpointId'],
    query: string,
    more?: boolean,
  ) => Promise<ContextActionResult<ContextHistorySearchResult>>
}

/** Context view props derived from the conversation slot, package store, and controller. */
export type ContextViewProps =
  PropsRuntime<'conversation.view'>
  & PropsStore<ReturnType<typeof createContextViewStore>>
  & InjectFace<ContextViewInjected>
  & PropsLocale<'sessionContext'>

/** Business callback injected into the Context occupancy action. */
export interface ContextMeterActionInjected {
  openContext: () => void
}

/** Context occupancy action props. */
export type ContextMeterActionProps =
  PropsRuntime<'conversation.context-meter.action'>
  & ContextMeterActionInjected
  & PropsLocale<'sessionContext'>
