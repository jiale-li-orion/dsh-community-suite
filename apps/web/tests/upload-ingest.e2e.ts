/** Keyless upload response transcript through the shipped Web plugin composition. */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-host-apiproxy'
import { WORKBENCH_UPLOAD_PATH } from '@deepseek-ai/dsh-workbench'
import { compareOrRefreshGolden, launchWebScaffold } from './scaffold.ts'

it('uploads opaque ids and recovers invalid metadata without duplicating valid completed uploads', async () => {
  const scaffold = await launchWebScaffold()
  try {
    const sessionId = SessionId('upload-ingest-web')
    const created = await scaffold.ctx.apiProxy.sessions.create({
      rpcId: 'upload-ingest-create' as never,
      payload: { sessionId, cwd: scaffold.workspaceCwd },
    })
    expect(created.result.ok).toBe(true)
    const transcript: unknown[] = []
    const upload = async (id: string, name: string, body?: string): Promise<void> => {
      const query = new URLSearchParams({ sessionId, name, device: 'mobile-app', ingestId: id })
      const response = await fetch(`${scaffold.baseUrl}${WORKBENCH_UPLOAD_PATH}?${query}`, { method: 'POST', body })
      const result: unknown = await response.json()
      transcript.push({ id, status: response.status, result })
    }
    await upload('__proto__', 'notes.txt', 'hello')
    await upload('__proto__', 'notes.txt')
    const indexPath = join(scaffold.workspaceCwd, 'uploads/.dsh/ingest.json')
    const index = JSON.parse(await readFile(indexPath, 'utf8')) as Record<string, unknown>
    index.broken = { path: 'uploads/mobile-app/missing.txt' }
    await writeFile(indexPath, JSON.stringify(index))
    await upload('broken', 'recovered.txt', 'recovered')
    await upload('__proto__', 'notes.txt')
    expect(await readFile(join(scaffold.workspaceCwd, 'uploads/mobile-app/notes.txt'), 'utf8')).toBe('hello')
    expect(await readFile(join(scaffold.workspaceCwd, 'uploads/mobile-app/recovered.txt'), 'utf8')).toBe('recovered')
    await compareOrRefreshGolden(
      fileURLToPath(new URL('./snapshots/upload-ingest/http.expected.json', import.meta.url)),
      JSON.stringify(transcript, null, 2),
      scaffold.mode,
    )
  } finally {
    await scaffold.close()
  }
})
