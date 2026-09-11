/**
 * The composer's upload action: hand one picked file to the session workspace
 * through the route the workspace listing names.
 * @module @deepseek-ai/dsh-client-ui-workbench/client/upload-action
 */

import type { SessionId } from '@deepseek-ai/dsh-session'
import type { WorkbenchListing } from '@deepseek-ai/dsh-workbench/types'

/** How the action learns where to post. */
export type ListingReader = (sessionId: SessionId, path: string | null) => Promise<WorkbenchListing>

/**
 * Build the upload action over a listing reader.
 * @param listDir - reads the workspace listing, which names the upload route.
 * @returns the action the composer control calls.
 */
export function createUploadAction(listDir: ListingReader) {
  return async (sessionId: SessionId, file: File): Promise<string> => {
    const listing = await listDir(sessionId, null)
    const params = new URLSearchParams({ sessionId, name: file.name })
    const response = await fetch(`${listing.uploadRoute}?${params.toString()}`, {
      method: 'POST',
      body: file,
    })
    if (!response.ok) {
      const reason = (await response.text()).trim()
      throw new Error(reason === '' ? `HTTP ${String(response.status)}` : reason)
    }
    const written = await response.json() as { path: string }
    return written.path
  }
}
