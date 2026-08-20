// Web e2e scenario: the shipped Context panel over a real Agent, reviewed
// range commit, exact checkpoint recall, and same-Session edit-and-continue.
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import type { AgentHandle } from '@deepseek-ai/dsh-agent'
import {
  CompactionPreparationId,
  compactionPreparationDigest,
} from '@deepseek-ai/dsh-compaction'
import { createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-title'
import type {} from '@deepseek-ai/dsh-token-meter'
import type {} from '@deepseek-ai/dsh-workspace'
import {
  assertFixtureInventory,
  captureStableAria,
  compareOrRefreshGolden,
  launchWebScaffold,
  watchConsole,
  webSnapshotMode,
  type WebScaffold,
} from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/context-management', import.meta.url))
const INITIAL_EXPECTED = join(SNAPSHOT_DIR, 'initial.expected.md')
const RESUME_EXPECTED = join(SNAPSHOT_DIR, 'resume.expected.md')
const RECALL_EXPECTED = join(SNAPSHOT_DIR, 'recall.expected.md')
const REWRITE_EXPECTED = join(SNAPSHOT_DIR, 'rewrite.expected.md')
const REPLAY_FIXTURE = fileURLToPath(new URL('./snapshots/feedback-command/session.jsonl', import.meta.url))
const MODE = webSnapshotMode()
const SESSION_ID = SessionId('context-management-web-e2e')
const TITLE = 'Context management verification'
const FIRST_PROMPT = `Original request with ARCHIVE_FACT_42. ${'background '.repeat(120)}`
const FIRST_REPLY = `Original response. ${'result '.repeat(120)}`
const SECOND_PROMPT = 'Current request that will be corrected.'
const SECOND_REPLY = 'Current answer derived from the old request.'

/** Create two settled turns before the Agent is published, so continuation owns turn three. */
function conversationSeed(): readonly import('@deepseek-ai/dsh-session').SessionEvent[] {
  const session = Session.create(SessionId('context-management-seed'))
  const appendTurn = (turn: number, prompt: string, reply: string): void => {
    session.append('turn/start', { turn })
    const user = session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: prompt }],
      source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    if (turn === 1) {
      session.append('session/title', {
        title: TITLE,
        messageSeqs: [user.seq],
        source: { kind: 'fallback' },
      })
    }
    session.append('step/start', { turn, step: 1 })
    session.append('assistant/message', {
      turn,
      step: 1,
      message: createAssistantMessage({
        content: [{ type: 'text', text: reply }],
        source: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
      }),
    }, { surfaceOp: 'append' })
    session.append('step/end', { turn, step: 1 })
    session.append('turn/end', { turn, reason: { kind: 'completed' } })
  }
  appendTurn(1, FIRST_PROMPT, FIRST_REPLY)
  appendTurn(2, SECOND_PROMPT, SECOND_REPLY)
  // This seed owns no timing claim. Wall-clock appends can cross a millisecond
  // under load and toggle the stats summary's optional LLM-duration segment.
  const seedTime = Date.now()
  return session.events.map(event => ({ ...event, time: seedTime }))
}

/** Record one ready preparation over the first turn using the scoped meter's exact price. */
async function prepareReview(handle: AgentHandle, scaffold: WebScaffold): Promise<void> {
  const session = handle.agent.session
  const nodes = session.readSurface().nodes
  const selected = nodes.slice(0, 2)
  const start = selected[0]
  const end = selected.at(-1)
  if (start === undefined || end === undefined) throw new Error('Context e2e seed has no first-turn range')
  const meter = handle.agent.ctx.get('tokenMeter')
  if (meter === undefined) throw new Error('Context e2e Agent has no scoped token meter')
  const measurement = meter.measureRange(session, 0, selected.length)
  const shadowedTokenCount = measurement.nodes.reduce((total, node) => total + node.tokens, 0)
  const preparationId = CompactionPreparationId('context-management-preparation')
  const summary = [{
    type: 'text' as const,
    text: '## Background Facts Still in Force\n- ARCHIVE_FACT_42\n\n## Open Threads Originating Here\n- Continue the current request.',
  }]
  session.append('compaction/preparation/requested', {
    preparationId,
    start,
    end,
    shadowedSeqs: [...selected],
    shadowedDigest: compactionPreparationDigest(selected),
    shadowedTokenCount,
    unitCount: 2,
    preservationBrief: 'Keep ARCHIVE_FACT_42 exactly.',
  })
  session.append('compaction/preparation/planned', {
    preparationId,
    plan: {
      strategy: 'direct',
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      contextWindow: 1_000_000,
      modelMaxOutputTokens: 256_000,
      desiredOutputTokens: 16_000,
      outputTokenCap: 16_000,
      directInputTokens: shadowedTokenCount + 256,
      inputTokenBudget: 984_000,
    },
    chunks: [{
      index: 0,
      stage: 'direct',
      startSeq: start,
      endSeq: end,
      part: 1,
      parts: 1,
      estimatedTokens: shadowedTokenCount + 256,
      inputDigest: 'context-management-fixture',
    }],
  })
  session.append('compaction/preparation/attempted', {
    preparationId,
    attempt: {
      index: 0,
      stage: 'direct',
      chunkIndexes: [0],
      inputTokens: shadowedTokenCount + 256,
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      maxTokens: 16_000,
    },
  })
  session.append('compaction/preparation/call', {
    preparationId,
    call: {
      index: 0,
      stage: 'direct',
      chunkIndexes: [0],
      summary,
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      maxTokens: 16_000,
    },
  })
  session.append('compaction/preparation/ready', {
    preparationId,
    chunks: [{
      index: 0,
      stage: 'direct',
      startSeq: start,
      endSeq: end,
      part: 1,
      parts: 1,
      estimatedTokens: shadowedTokenCount + 256,
      inputDigest: 'context-management-fixture',
    }],
    summary,
  })
  await scaffold.ctx.sessions.flush(session)
}

describe('web e2e: Session Context management', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let handle: AgentHandle
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    if (MODE === 'record') throw new Error('context-management uses a borrowed one-call replay fixture')
    scaffold = await launchWebScaffold({ replayFixture: REPLAY_FIXTURE })
    const workspace = join(scaffold.workspaceCwd, 'workspace')
    await mkdir(workspace, { recursive: true })
    handle = await scaffold.ctx.agents.create({
      sessionId: SESSION_ID,
      seed: conversationSeed(),
      meta: { cwd: workspace },
      agentOptions: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
    })
    await prepareReview(handle, scaffold)
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await connectFreshWorkspace(page, scaffold.workspaceCwd)
    const registered = await scaffold.ctx.workspaceRegistry.resolveByPath(workspace)
    if (registered === undefined) throw new Error('Context e2e workspace was not registered')
    await registered.attachSession(SESSION_ID)
    await page.getByRole('treeitem', { name: new RegExp(TITLE, 'u') }).click()
    await page.getByRole('tab', { name: 'Context', exact: true }).click()
    await page.getByRole('button', { name: 'Continue compaction review' }).waitFor({ timeout: 15_000 })
  }, 120_000)

  afterAll(async () => {
    const failures: unknown[] = []
    await browser?.close().catch((error: unknown) => failures.push(error))
    await handle?.dispose().catch((error: unknown) => failures.push(error))
    await scaffold?.close().catch((error: unknown) => failures.push(error))
    if (failures.length > 0) throw new AggregateError(failures, 'Context e2e cleanup failed')
  })

  it('reviews, commits, recalls, and continues from one same-Session rewrite', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-context-management'))
    const resume = (await captureStableAria(page, '[class*="centerCol"]', scaffold.workspaceCwd))
      .split(SESSION_ID).join('{{sessionId}}')
    await compareOrRefreshGolden(RESUME_EXPECTED, resume, MODE)
    await page.getByRole('button', { name: 'Continue compaction review' }).click()
    await page.getByRole('dialog', { name: 'Review compaction summary' }).waitFor({ timeout: 15_000 })
    const initial = (await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd))
      .split(SESSION_ID).join('{{sessionId}}')
    await compareOrRefreshGolden(INITIAL_EXPECTED, initial, MODE)

    await page.getByRole('button', { name: 'Commit compaction' }).click()
    await page.getByText('Compaction checkpoint', { exact: true }).waitFor({ timeout: 15_000 })
    await page.getByText('Context version 1', { exact: true }).waitFor({ timeout: 15_000 })
    const checkpoint = page.locator('[data-context-unit]').filter({ hasText: 'Compaction checkpoint' })
    await checkpoint.getByRole('button', { name: 'View complete content' }).click()
    await page.getByRole('heading', { name: 'Checkpoint originals' }).waitFor({ timeout: 10_000 })
    await page.getByRole('button', { name: 'Read originals' }).click()
    await page.getByText(/ARCHIVE_FACT_42/u).last().waitFor({ timeout: 10_000 })
    await page.getByPlaceholder('Search originals').fill('ARCHIVE_FACT_42')
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await expect.poll(() => page.locator('[class*="match"]').count(), { timeout: 10_000 }).toBeGreaterThan(0)
    const recalled = (await captureStableAria(page, '[class*="centerCol"]', scaffold.workspaceCwd))
      .split(SESSION_ID).join('{{sessionId}}')
    await compareOrRefreshGolden(RECALL_EXPECTED, recalled, MODE)

    await page.getByRole('button', { name: 'Close context unit', exact: true }).click()
    const currentUser = page.locator('[data-context-unit]').filter({ hasText: SECOND_PROMPT })
    await currentUser.getByRole('button', { name: 'Edit this user prompt', exact: true }).click()
    const editor = page.getByRole('dialog', { name: 'Edit context and continue' })
    await editor.locator('textarea').fill('Corrected current request.')
    const settled = scaffold.whenTurnSettled()
    await editor.getByRole('button', { name: 'Save and continue' }).click()
    await settled
    await page.getByRole('tab', { name: 'Chat', exact: true }).click()
    await page.getByText('LIGHTHOUSE', { exact: true }).waitFor({ timeout: 15_000 })
    await page.getByText('Model context updated', { exact: true }).waitFor({ timeout: 15_000 })
    const rewritten = (await captureStableAria(page, '[class*="centerCol"]', scaffold.workspaceCwd))
      .split(SESSION_ID).join('{{sessionId}}')
    await compareOrRefreshGolden(REWRITE_EXPECTED, rewritten, MODE)
  }, 90_000)

  it('stays console-clean and owns only its expected outputs', async () => {
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
    await assertFixtureInventory(SNAPSHOT_DIR, [
      'initial.expected.md',
      'recall.expected.md',
      'resume.expected.md',
      'rewrite.expected.md',
    ])
  })
})
