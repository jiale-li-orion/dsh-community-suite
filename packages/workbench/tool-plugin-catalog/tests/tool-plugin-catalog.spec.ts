/**
 * The catalog tools over the real tools registry, a recording catalog, the real
 * approval service, and a recording process seam: search shapes a model-facing
 * page, and install resolves the entry, validates the target, gates on
 * approval, and builds an argv array rather than a shell string.
 */
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { CallId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import ApprovalService from '@deepseek-ai/dsh-user-approval'
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import type { PluginCatalogEntry } from '@deepseek-ai/dsh-plugin-catalog'
import type { SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import * as ToolPluginCatalog from '../src/index.ts'
import { parseInstallTarget, PluginInstallTargetError } from '../src/install-target.ts'
import { resolveProfile } from '../src/profile.ts'
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

/** One recorded spawn request plus the outcome the fake seam answers with. */
interface RecordingSubprocess {
  readonly specs: SubprocessSpawnSpec[]
  exitCode: number
  stdout: string
  stderr: string
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
 * @param config - plugin config (the profile override).
 * @returns the context, the recorded spawns, and the catalog recorder.
 */
/** The catalog recorder a test asserts on. */
interface CatalogRecorder {
  search: ReturnType<typeof vi.fn>
  get: ReturnType<typeof vi.fn>
}

async function harness(
  entries: readonly PluginCatalogEntry[] = [ENTRY],
  outcome: ApprovalOutcome = 'allowed-once',
  config: ToolPluginCatalog.Config = { profile: 'web' },
  options: { approval?: boolean; collected?: boolean } = {},
): Promise<{ ctx: Context; subprocess: RecordingSubprocess; catalog: CatalogRecorder }> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  const subprocess: RecordingSubprocess = { specs: [], exitCode: 0, stdout: 'installed', stderr: '' }
  ctx.provide('subprocess', {
    spawn: (spec: SubprocessSpawnSpec) => {
      subprocess.specs.push(spec)
      return {
        pid: 1,
        stdin: undefined,
        stdout: undefined,
        stderr: undefined,
        collected: (options.collected ?? true)
          ? {
            stdout: { readFrom: () => ({ text: subprocess.stdout, bytes: subprocess.stdout.length, lossy: false }) },
            stderr: { readFrom: () => ({ text: subprocess.stderr, bytes: subprocess.stderr.length, lossy: false }) },
          }
          : {},
        done: Promise.resolve({ exitCode: subprocess.exitCode, signal: null }),
        terminate: () => {},
        waitForExit: () => Promise.resolve(true),
      }
    },
  } as never)
  const catalog = {
    search: vi.fn(() => Promise.resolve({ total: entries.length, entries })),
    get: vi.fn((url: string) => Promise.resolve(entries.find(entry => entry.url === url))),
  }
  ctx.provide('pluginCatalog', catalog as never)
  if (options.approval ?? true) {
    await ctx.plugin(ApprovalService)
    ctx.on('approval/request', () => Promise.resolve(outcome))
  }
  await ctx.plugin(ToolPluginCatalog, config)
  return { ctx, subprocess, catalog }
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
  it('resolves the entry, approves, and runs an argv install with the derived profile', async () => {
    const { ctx, subprocess, catalog } = await harness()
    const result = await run(ctx, 'plugin_install', { url: ENTRY.url }, fakeAgent())
    expect(result.isError).toBe(false)
    expect(catalog.get).toHaveBeenCalledWith(ENTRY.url, expect.anything())
    expect(subprocess.specs).toHaveLength(1)
    const argv = subprocess.specs[0]!.argv
    expect(argv[0]).toBe(process.execPath)
    expect(argv.slice(-6)).toEqual([process.argv[1], 'plugin', '--profile', 'web', 'add', 'github:example/dsh-example'])
    expect(result.value).toMatchObject({
      installed: true,
      target: 'github:example/dsh-example',
      profile: 'web',
    })
    expect((result.value as { text: string }).text).toContain('Restart the process to load it.')
  })

  it('refuses an unknown URL, a rejected decision, and a missing approval channel', async () => {
    const { ctx, subprocess } = await harness()
    expect((await run(ctx, 'plugin_install', { url: 'https://github.com/nobody/nothing' }, fakeAgent())).isError).toBe(true)
    expect(subprocess.specs).toHaveLength(0)

    const rejected = await harness([ENTRY], 'rejected')
    const outcome = await run(rejected.ctx, 'plugin_install', { url: ENTRY.url }, fakeAgent())
    expect(outcome.isError).toBe(true)
    expect(JSON.stringify(outcome.error)).toContain('not allowed')
    expect(rejected.subprocess.specs).toHaveLength(0)

    const noAgent = await harness()
    expect((await run(noAgent.ctx, 'plugin_install', { url: ENTRY.url })).isError).toBe(true)
  })

  it('fails closed without an approval service and tolerates a child with no collected streams', async () => {
    const unapproved = await harness([ENTRY], 'allowed-once', { profile: 'web' }, { approval: false })
    expect((await run(unapproved.ctx, 'plugin_install', { url: ENTRY.url }, fakeAgent())).isError).toBe(true)
    expect(unapproved.subprocess.specs).toHaveLength(0)

    const silent = await harness([ENTRY], 'allowed-once', { profile: 'web' }, { collected: false })
    silent.subprocess.stdout = ''
    silent.subprocess.stderr = ''
    const result = await run(silent.ctx, 'plugin_install', { url: ENTRY.url }, fakeAgent())
    expect(result.isError).toBe(false)
    expect((result.value as { text: string }).text).toBe('Installed dsh-example into profile "web". Restart the process to load it.')
  })

  it('fails closed when the CLI entry cannot be re-invoked', async () => {
    const { ctx } = await harness()
    const saved = process.argv
    // The one platform fact this tool cannot derive: the entry it re-invokes.
    process.argv = [saved[0] ?? 'node']
    try {
      expect((await run(ctx, 'plugin_install', { url: ENTRY.url }, fakeAgent())).isError).toBe(true)
    } finally {
      process.argv = saved
    }
  })

  it('surfaces a failing install as a tool error with the child output', async () => {
    const { ctx, subprocess } = await harness()
    subprocess.exitCode = 1
    subprocess.stderr = 'ERR_PNPM_FETCH_404'
    const result = await run(ctx, 'plugin_install', { url: ENTRY.url }, fakeAgent())
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result.error)).toContain('ERR_PNPM_FETCH_404')

    // A silent failure still names the exit code, without a trailing colon.
    subprocess.stderr = ''
    subprocess.stdout = ''
    expect(JSON.stringify((await run(ctx, 'plugin_install', { url: ENTRY.url }, fakeAgent())).error))
      .toContain('failed with exit code 1')
  })

  it('presents one generic card', async () => {
    const { ctx } = await harness()
    expect(ctx.tools.get('plugin_install')?.presentCall?.({ url: ENTRY.url }))
      .toMatchObject({ card: 'generic', title: 'Install a catalog plugin' })
  })
})

describe('parseInstallTarget', () => {
  it('accepts an npm specifier and a github reference, with or without a profile', () => {
    expect(parseInstallTarget('dsh plugin --profile web add dsh-example')).toBe('dsh-example')
    expect(parseInstallTarget('dsh plugin add dsh-example@1.2.3')).toBe('dsh-example@1.2.3')
    expect(parseInstallTarget('dsh plugin --profile web add @scope/dsh-example')).toBe('@scope/dsh-example')
    expect(parseInstallTarget('dsh plugin --profile web add github:owner/repo')).toBe('github:owner/repo')
    expect(parseInstallTarget('dsh plugin --profile web add github:owner/repo#packages/sub')).toBe('github:owner/repo#packages/sub')
  })

  it('refuses a foreign command shape, a traversal, a metacharacter, and an unknown target form', () => {
    for (const command of [
      'npm install dsh-example',
      'dsh plugin add',
      'dsh plugin --profile web add a b',
      'dsh plugin --profile web add ../evil',
      'dsh plugin --profile web add dsh-example; rm -rf /',
      'dsh plugin --profile web add dsh-example$(whoami)',
      'dsh plugin --profile web add file:../elsewhere',
      'dsh plugin --profile web add https://example.com/plugin.tgz',
    ]) {
      expect(() => parseInstallTarget(command)).toThrow(PluginInstallTargetError)
    }
  })
})

describe('resolveProfile', () => {
  it('reads the profile from an installed module path and falls back to config', () => {
    expect(resolveProfile('file:///home/u/.dsh/profiles/web/node_modules/@deepseek-ai/dsh-tool-plugin-catalog/lib/index.js', undefined)).toBe('web')
    expect(resolveProfile('file:///repo/packages/workbench/tool-plugin-catalog/src/index.ts', 'standard')).toBe('standard')
    expect(() => resolveProfile('file:///repo/packages/workbench/tool-plugin-catalog/src/index.ts', undefined)).toThrow(/cannot determine the active profile/)
  })
})

describe('tool-plugin-catalog invariant companion', () => {
  it('declares its companion identity and explained empty invariant', () => {
    expect(ToolPluginCatalogInvariant.name).toBe('tool-plugin-catalog-invariant')
    expect(ToolPluginCatalogInvariant.inject).toEqual(['invariants'])
  })
})
