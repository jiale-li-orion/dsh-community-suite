/** Agent-owned opaque identities shared across durable lifecycle records. */

import type { Branded } from '@deepseek-ai/dsh-brand'

/** Stable identity of one request to run the model from an already committed context generation. */
export type ContextRunId = Branded<'ContextRunId'>

/**
 * Brand a string as a {@link ContextRunId}.
 * @param id - caller-minted lifecycle identity.
 * @returns the same string, branded; no validation is performed.
 */
export function ContextRunId(id: string): ContextRunId {
  return id as ContextRunId
}
