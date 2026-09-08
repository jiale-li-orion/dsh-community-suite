/**
 * Model-facing plugin discovery and install. `plugin_search` reads the
 * configured catalog; `plugin_install` resolves one entry by URL, validates
 * the index's own install target, asks `ctx.approval` for the decision, and
 * only then runs `dsh plugin --profile <profile> add <target>` through the
 * subprocess seam as an argv array. Nothing here trusts the catalog's command
 * text or synthesizes one from fields.
 * @module @deepseek-ai/dsh-plugin-catalog-tools
 */

import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { PluginCatalogEntry } from '@deepseek-ai/dsh-plugin-catalog'
import type {} from '@deepseek-ai/dsh-plugin-catalog'
import type { SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import type {} from '@deepseek-ai/dsh-subprocess'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, ToolExecution } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-user-approval'
import { parseInstallTarget } from './install-target.ts'
import { resolveProfile } from './profile.ts'

export const name = 'tool-plugin-catalog'

/** Required services: the registry, the catalog, and the process seam installs run through. */
export const inject = ['tools', 'pluginCatalog', 'subprocess']

/** Install config: the profile to target when this build cannot derive it. */
export interface Config {
  /**
   * Profile an install targets. Omitted in an installed deployment, where the
   * plugin's own module path names the profile; a source launch must set it.
   */
  profile?: string
}

export const Config: z<Config> = z.object({
  profile: z.string(),
})

/** Grace period for the install child's terminate escalation. */
const INSTALL_GRACE_MS = 10_000

/** Maximum install output retained for the model. */
const INSTALL_OUTPUT_MAX_BYTES = 32 * 1024

/** One tool card per catalog call. */
function callCard(title: string, rawInput: unknown): GenericCallView {
  return { card: 'generic', title, kind: 'execute', rawInput }
}

/** One search result row, model-facing. */
function searchRow(entry: PluginCatalogEntry): {
  name: string
  owner: string
  url: string
  category: string
  description: string
  install: string
  stars?: number
  downloads?: number
} {
  return {
    name: entry.name,
    owner: entry.owner,
    url: entry.url,
    category: entry.category,
    description: entry.description,
    install: entry.install,
    ...entry.stars === null ? {} : { stars: entry.stars },
    ...entry.downloads === null ? {} : { downloads: entry.downloads },
  }
}

/** Model-facing summary of one search page. */
function searchNotice(total: number, returned: number): string {
  if (total === 0) return 'No catalog entries matched.'
  return returned < total
    ? `${String(returned)} of ${String(total)} catalog entries matched; narrow the query or raise limit for more.`
    : `${String(total)} catalog ${total === 1 ? 'entry' : 'entries'} matched.`
}

/** Render one search page as Markdown lines. */
function renderRows(entries: readonly PluginCatalogEntry[]): string {
  return entries.map(entry => [
    `- **${entry.name}** (${entry.owner}) — ${entry.description}`,
    `  ${entry.url} · ${entry.category}${entry.stars === null ? '' : ` · ${String(entry.stars)}★`}`,
    `  install: \`${entry.install}\``,
  ].join('\n')).join('\n')
}

/**
 * Run the install command and collect its outcome.
 * @param ctx - context carrying the subprocess seam.
 * @param argv - the full argv, executable first.
 * @param signal - caller cancellation.
 * @returns exit code plus collected stdout and stderr.
 */
async function runInstall(
  ctx: Context,
  argv: readonly string[],
  signal: AbortSignal,
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  const handle = ctx.subprocess.spawn({
    argv,
    cwd: process.cwd(),
    stdio: {
      stdin: 'ignore',
      stdout: { maxBytes: INSTALL_OUTPUT_MAX_BYTES },
      stderr: { maxBytes: INSTALL_OUTPUT_MAX_BYTES },
    },
    graceMs: INSTALL_GRACE_MS,
    signal,
  } satisfies SubprocessSpawnSpec)
  const outcome = await handle.done
  return {
    exitCode: outcome.exitCode,
    stdout: handle.collected.stdout?.readFrom(0).text ?? '',
    stderr: handle.collected.stderr?.readFrom(0).text ?? '',
  }
}

/**
 * Ask for approval and run the install.
 * @param ctx - context carrying approval and the subprocess seam.
 * @param exec - the tool execution (agent, call id, signal).
 * @param entry - the resolved catalog entry.
 * @param target - the validated install target.
 * @param profile - the profile the install targets.
 * @param cliEntry - the CLI entry to re-invoke.
 * @returns the child's exit facts.
 */
async function install(
  ctx: Context,
  exec: ToolExecution,
  entry: PluginCatalogEntry,
  target: string,
  profile: string,
  cliEntry: string,
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  const approval = ctx.get('approval')
  if (approval === undefined) {
    throw new Error('plugin_install requires approval, but no approval service is composed')
  }
  const agent: Agent | undefined = exec.agent
  if (agent === undefined) {
    throw new Error('plugin_install requires approval, but the call has no agent to route it through')
  }
  const outcome = await approval.request({
    agent,
    toolName: 'plugin_install',
    callId: exec.callId,
    reason: `install the plugin ${entry.name} (${entry.url}) into profile "${profile}"`,
    signal: exec.signal,
  })
  if (outcome !== 'allowed-once') {
    throw new Error(`the install of ${entry.name} was not allowed (${outcome})`)
  }
  return runInstall(ctx, [process.execPath, ...process.execArgv, cliEntry, 'plugin', '--profile', profile, 'add', target], exec.signal)
}

/**
 * Register the catalog tools.
 * @param ctx - Cordis context carrying tools, the catalog, and the process seam.
 * @param config - resolved plugin config (the profile override, when any).
 */
export function apply(ctx: Context, config: Config = {}): void {
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'plugin_search',
    description: 'Search the configured plugin catalog for published DSH plugins. '
      + 'Returns each entry\'s identity, one-line summary, popularity, and the catalog\'s own install command. '
      + 'Listing is not a security review: installing a plugin runs third-party code with this deployment\'s permissions.',
    parameters: {
      query: { type: 'string', description: 'Case-insensitive substring matched against plugin name, owner, and summaries.' },
      category: { type: 'string', description: 'Exact catalog category id, e.g. "tools" or "theme".' },
      limit: { type: 'number', description: 'Maximum entries to return (default 10, capped at 50).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string', required: true },
          total: { type: 'number', required: true },
          plugins: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string', required: true },
                owner: { type: 'string', required: true },
                url: { type: 'string', required: true },
                category: { type: 'string', required: true },
                description: { type: 'string', required: true },
                install: { type: 'string', required: true },
                stars: { type: 'number' },
                downloads: { type: 'number' },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.text }],
    },
    async execute(args, exec) {
      const page = await ctx.pluginCatalog.search(args, exec.signal)
      const rows = page.entries.map(searchRow)
      const notice = searchNotice(page.total, rows.length)
      return {
        text: rows.length === 0 ? notice : `${notice}\n\n${renderRows(page.entries)}`,
        total: page.total,
        plugins: rows,
      }
    },
    presentCall: args => callCard('Search the plugin catalog', args),
  })), 'tool-plugin-catalog: plugin_search')

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'plugin_install',
    description: 'Install one catalog plugin into this deployment\'s profile. '
      + 'Takes the exact url a plugin_search result carried; the install target comes from the catalog entry, never from you. '
      + 'Requires user approval, and the running process must be restarted for the new plugin to load.',
    parameters: {
      url: { type: 'string', required: true, description: 'Exact entry url from a plugin_search result.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string', required: true },
          installed: { type: 'boolean', required: true },
          target: { type: 'string', required: true },
          profile: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.text }],
    },
    async execute(args, exec) {
      const entry = await ctx.pluginCatalog.get(args.url, exec.signal)
      if (entry === undefined) {
        throw new Error(`no catalog entry has url ${JSON.stringify(args.url)}; search first and pass the url a result carried`)
      }
      const target = parseInstallTarget(entry.install)
      const profile = resolveProfile(import.meta.url, config.profile)
      const cliEntry = process.argv[1]
      if (cliEntry === undefined) {
        throw new Error('plugin_install cannot re-invoke the CLI: process.argv[1] is not set')
      }
      const result = await install(ctx, exec, entry, target, profile, cliEntry)
      const output = [result.stdout, result.stderr].filter(text => text.trim() !== '').join('\n').trim()
      if (result.exitCode !== 0) {
        throw new Error(`installing ${target} into profile "${profile}" failed with exit code ${String(result.exitCode)}${output === '' ? '' : `:\n${output}`}`)
      }
      return {
        text: `Installed ${entry.name} into profile "${profile}". Restart the process to load it.`
          + (output === '' ? '' : `\n\n${output}`),
        installed: true,
        target,
        profile,
      }
    },
    presentCall: args => callCard('Install a catalog plugin', args),
  })), 'tool-plugin-catalog: plugin_install')
}
