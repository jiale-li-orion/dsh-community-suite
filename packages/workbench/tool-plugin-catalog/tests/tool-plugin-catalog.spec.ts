/**
 * The catalog tools over the real tools registry, a recording catalog, the
 * real approval service, and a recording install service: search shapes a
 * model-facing page, and install resolves the entry, gates on approval, then
 * hands the URL to the install capability.
 */
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { CallId } from '@deepseek-ai/dsh-llm'
import type { PluginCatalogEntry } from '@deepseek-ai/dsh-plugin-catalog'
import type { PluginInstallResult } from '@deepseek-ai/dsh-plugin-install'
import { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import ApprovalService from '@deepseek-ai/dsh-user-approval'
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import * as ToolPluginCatalog from '../src/index.ts'
import * as ToolPluginCatalogInvariant from '../src/invariant.ts'

const ENTRY: PluginCatalogEntry = {
  name: 'dsh-example',
  owner: 'example',
  url: 'https://github.com/example/dsh-example',
  category: 'tools',
  description: 'An example plugin.',
  npm: 'dsh-example',
  version: '1.0.0',
  stars: 4,
  downloads: null,
  install: 'dsh plugin --profile web add github:example/dsh-example',
  added: '2026-09-01',
}

/** The catalog recorder a test asserts on. */
interface CatalogRecorder {
  search: ReturnType<typeof vi.fn>
  get: ReturnType<typeof vi.fn>
}

/** The install recorder a test asserts on. */
interface InstallRecorder {
  install: ReturnType<typeof vi.fn>
  result: PluginInstallResult
  failure: Error | undefined
}

/** A fake agent carrying an open turn so the approval audit pair can append. */
function fakeAgent(): Agent {
  const events: Array<{ type: string; data?: Record<string, unknown> }> = [{ type: 'turn/start' }]
  const id = SessionId('catalog-session')
  return {
    id,
    session: {
      id,
      header: { version: 0, id, createdAt: 0 },
      events,
      append: (type: string, data: Record<string, unknown>) => {
        const event = { type, data }
        events.push(event)
        return event
      },
    },
  } as unknown as Agent
}

/**
 * Boot the tools over the registry.
 * @param entries - entries the recording catalog serves.
 * @param outcome - what the composed answerer decides.
 * @param options - harness switches (approval service, install failure).
 * @returns the context, the catalog recorder, and the install recorder.
 */
async function harness(
  entries: readonly PluginCatalogEntry[] = [ENTRY],
  outcome: ApprovalOutcome = 'allowed-once',
  options: { approval?: boolean; installFails?: boolean } = {},
): Promise<{ ctx: Context; catalog: CatalogRecorder; install: InstallRecorder }> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  const catalog: CatalogRecorder = {
    search: vi.fn(() => Promise.resolve({ total: entries.length, entries })),
    get: vi.fn((url: string) => Promise.resolve(entries.find(entry => entry.url === url))),
  }
  ctx.provide('pluginCatalog', catalog as never)
  const install: InstallRecorder = {
    install: vi.fn((_url: string): Promise<PluginInstallResult> => install.failure === undefined
      ? Promise.resolve(install.result)
      : Promise.reject(install.failure)),
    result: { name: ENTRY.name, target: 'github:example/dsh-example', profile: 'web', output: 'installed' },
    failure: undefined,
  }
  ctx.provide('pluginInstall', install as never)
  if (options.approval ?? true) {
    await ctx.plugin(ApprovalService)
    ctx.on('approval/request', () => Promise.resolve(outcome))
  }
  await ctx.plugin(ToolPluginCatalog)
  return { ctx, catalog, install }
}

const signal = new AbortController().signal
let call = 0

/** One tool result as the tests read it. */
interface ToolOutcome {
  isError: boolean
  value?: unknown
  error?: unknown
}

/**
 * Execute one registered tool.
 * @param ctx - booted context.
 * @param name - registered tool name.
 * @param args - parsed arguments.
 * @param agent - caller agent (required by tools that ask for approval).
 * @returns the execution result.
 */
async function run(
  ctx: Context,
  name: string,
  args: Record<string, unknown>,
  agent?: Agent,
): Promise<ToolOutcome> {
  return ctx.tools.execute({
    signal,
    callId: CallId(`call-${String(++call)}`),
    name,
    arguments: args,
    ...agent === undefined ? {} : { agent },
  })
}

describe('plugin_search', () => {
  it('returns a model-facing page with the install command the catalog carries', async () => {
    const { ctx } = await harness()
    const result = await run(ctx, 'plugin_search', { query: 'example' })
    expect(result.isError).toBe(false)
    const page = result.value as { text: string; total: number; plugins: unknown[] }
    expect(typeof page.text).toBe('string')
    expect(page.total).toBe(1)
    expect(page.plugins).toEqual([{
      name: 'dsh-example',
      owner: 'example',
      url: ENTRY.url,
      category: 'tools',
      description: 'An example plugin.',
      install: ENTRY.install,
      stars: 4,
    }])
    expect(page.text).toContain('1 catalog entry matched.')
    expect(page.text).toContain('install: `dsh plugin --profile web add github:example/dsh-example`')
  })

  it('reports an empty page and a truncated page distinctly', async () => {
    const empty = await harness([])
    expect((await run(empty.ctx, 'plugin_search', {})).value).toMatchObject({ text: 'No catalog entries matched.', total: 0, plugins: [] })

    const many = await harness([ENTRY, { ...ENTRY, name: 'dsh-second', url: 'https://github.com/example/dsh-second' }])
    // The provider owns the page cut; the tool only reports the two numbers.
    many.catalog.search.mockResolvedValueOnce({ total: 2, entries: [ENTRY] })
    const truncated = await run(many.ctx, 'plugin_search', { limit: 1 })
    expect((truncated.value as { text: string }).text).toContain('1 of 2 catalog entries matched')
  })

  it('reports an all-unknown entry without popularity and a plural page', async () => {
    const bare: PluginCatalogEntry = { ...ENTRY, name: 'dsh-bare', url: 'https://github.com/example/dsh-bare', stars: null, downloads: null }
    const popular: PluginCatalogEntry = { ...ENTRY, name: 'dsh-popular', url: 'https://github.com/example/dsh-popular', downloads: 7 }
    const { ctx, catalog } = await harness([bare])
    const single = await run(ctx, 'plugin_search', {})
    expect((single.value as { plugins: unknown[] }).plugins).toEqual([
      { name: 'dsh-bare', owner: 'example', url: bare.url, category: 'tools', description: bare.description, install: bare.install },
    ])
    expect((single.value as { text: string }).text).not.toContain('★')

    catalog.search.mockResolvedValueOnce({ total: 2, entries: [ENTRY, popular] })
    const plural = await run(ctx, 'plugin_search', {})
    expect((plural.value as { text: string }).text).toContain('2 catalog entries matched.')
    expect((plural.value as { plugins: Array<Record<string, unknown>> }).plugins[1]).toMatchObject({ downloads: 7 })
  })

  it('presents one generic card', async () => {
    const { ctx } = await harness()
    expect(ctx.tools.get('plugin_search')?.presentCall?.({ query: 'x' }))
      .toMatchObject({ card: 'generic', title: 'Search the plugin catalog', kind: 'execute' })
  })
})

describe('plugin_install', () => {
  it('resolves the entry, approves, and delegates to the install capability', async () => {
    const { ctx, install } = await harness()
    const result = await run(ctx, 'plugin_install', { url: ENTRY.url }, fakeAgent())
    expect(result.isError).toBe(false)
    expect(install.install).toHaveBeenCalledWith(ENTRY.url, expect.anything())
    expect(result.value).toMatchObject({
      installed: true,
      target: 'github:example/dsh-example',
      profile: 'web',
    })
    expect((result.value as { text: string }).text).toContain('Restart the process to load it.')
  })

  it('refuses an unknown URL, a rejected decision, and a missing approval channel', async () => {
    const { ctx, install } = await harness()
    expect((await run(ctx, 'plugin_install', { url: 'https://github.com/nobody/nothing' }, fakeAgent())).isError).toBe(true)
    expect(install.install).not.toHaveBeenCalled()

    const rejected = await harness([ENTRY], 'rejected')
    const outcome = await run(rejected.ctx, 'plugin_install', { url: ENTRY.url }, fakeAgent())
    expect(outcome.isError).toBe(true)
    expect(JSON.stringify(outcome.error)).toContain('not allowed')
    expect(rejected.install.install).not.toHaveBeenCalled()

    const noAgent = await harness()
    expect((await run(noAgent.ctx, 'plugin_install', { url: ENTRY.url })).isError).toBe(true)

    const unapproved = await harness([ENTRY], 'allowed-once', { approval: false })
    expect((await run(unapproved.ctx, 'plugin_install', { url: ENTRY.url }, fakeAgent())).isError).toBe(true)
    expect(unapproved.install.install).not.toHaveBeenCalled()
  })

  it('surfaces a failing install as a tool error with the child output', async () => {
    const { ctx, install } = await harness()
    install.failure = new Error('installing github:example/dsh-example failed with exit code 1:\nERR_PNPM_FETCH_404')
    const result = await run(ctx, 'plugin_install', { url: ENTRY.url }, fakeAgent())
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result.error)).toContain('ERR_PNPM_FETCH_404')
  })

  it('omits the output block when the installer printed nothing', async () => {
    const { ctx, install } = await harness()
    install.result = { ...install.result, output: '' }
    const result = await run(ctx, 'plugin_install', { url: ENTRY.url }, fakeAgent())
    expect((result.value as { text: string }).text)
      .toBe('Installed dsh-example into profile "web". Restart the process to load it.')
  })

  it('presents one generic card', async () => {
    const { ctx } = await harness()
    expect(ctx.tools.get('plugin_install')?.presentCall?.({ url: ENTRY.url }))
      .toMatchObject({ card: 'generic', title: 'Install a catalog plugin' })
  })
})

describe('tool-plugin-catalog invariant companion', () => {
  it('declares its companion identity and explained empty invariant', () => {
    expect(ToolPluginCatalogInvariant.name).toBe('tool-plugin-catalog-invariant')
    expect(ToolPluginCatalogInvariant.inject).toEqual(['invariants'])
  })
})
