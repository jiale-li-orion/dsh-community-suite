/**
 * The install capability: resolve one catalog entry, validate the target it
 * carries, and run `dsh plugin --profile <profile> add <target>` as an argv
 * array. One implementation serves both planes — the agent tool gates the call
 * behind `ctx.approval`, the marketplace panel is the human's own gesture —
 * so a validated target, a derived profile, and one subprocess path exist once.
 * @module @deepseek-ai/dsh-plugin-install
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-plugin-catalog'
import type { SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import type {} from '@deepseek-ai/dsh-subprocess'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { parseInstallTarget } from './install-target.ts'
import { resolveProfile } from './profile.ts'
import type { PluginInstallResult } from './types.ts'

export type * from './types.ts'

/** Grace period for the install child's terminate escalation. */
const INSTALL_GRACE_MS = 10_000

/** Maximum install output retained for a caller. */
const INSTALL_OUTPUT_MAX_BYTES = 32 * 1024

/** Install config: the profile to target when this build cannot derive it. */
export interface Config {
  /**
   * Profile an install targets. Omitted in an installed deployment, where this
   * plugin's own module path names the profile; a source launch must set it.
   */
  profile?: string
}

export const Config: z<Config> = z.object({
  profile: z.string(),
})

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The install capability both planes call. */
    pluginInstall: PluginInstallService
  }
}

/** Refusal raised when an install cannot start or the installer fails. */
export class PluginInstallError extends Error {
  /** Stable diagnostic code. */
  readonly code: string

  /**
   * @param message - what failed.
   * @param code - stable diagnostic code.
   */
  constructor(message: string, code: string) {
    super(message)
    this.name = 'PluginInstallError'
    this.code = code
  }
}

/**
 * The install service. `install(url)` is the only entry: the URL names a
 * catalog entry, the entry names its own install command, and this service
 * decides whether that command's target may run and which profile it targets.
 */
export class PluginInstallService extends TypertRemoteService {
  static Config: z<Config> = Config

  static inject = ['subprocess', 'pluginCatalog']

  private readonly configuredProfile: string | undefined

  /**
   * @param ctx - owning Cordis context carrying the subprocess seam and the catalog.
   * @param config - resolved plugin config (the profile override, when any).
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'pluginInstall')
    this.configuredProfile = config.profile
  }

  /**
   * Install one catalog plugin.
   * @param url - the exact entry URL a catalog search returned.
   * @param signal - optional caller cancellation.
   * @returns the completed install's target, profile, and child output.
   * @throws PluginInstallError when the entry is unknown, the target is refused, or the installer fails.
   */
  @Remote('install')
  async install(url: string, signal?: AbortSignal): Promise<PluginInstallResult> {
    const entry = await this.ctx.pluginCatalog.get(url, signal)
    if (entry === undefined) {
      throw new PluginInstallError(
        `no catalog entry has url ${JSON.stringify(url)}; search the catalog first and pass the url a result carried`,
        'PLUGIN_INSTALL_UNKNOWN_ENTRY',
      )
    }
    const target = parseInstallTarget(entry.install)
    const profile = resolveProfile(import.meta.url, this.configuredProfile)
    const cliEntry = process.argv[1]
    if (cliEntry === undefined) {
      throw new PluginInstallError('cannot re-invoke the CLI: process.argv[1] is not set', 'PLUGIN_INSTALL_NO_ENTRY')
    }
    const outcome = await this.run(
      [process.execPath, ...process.execArgv, cliEntry, 'plugin', '--profile', profile, 'add', target],
      signal,
    )
    const output = [outcome.stdout, outcome.stderr].filter(text => text.trim() !== '').join('\n').trim()
    if (outcome.exitCode !== 0) {
      throw new PluginInstallError(
        `installing ${target} into profile "${profile}" failed with exit code ${String(outcome.exitCode)}`
        + (output === '' ? '' : `:\n${output}`),
        'PLUGIN_INSTALL_FAILED',
      )
    }
    return { name: entry.name, target, profile, output }
  }

  /** Spawn the installer and collect its exit facts. */
  private async run(
    argv: readonly string[],
    signal: AbortSignal | undefined,
  ): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
    const handle = this.ctx.subprocess.spawn({
      argv,
      cwd: process.cwd(),
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: INSTALL_OUTPUT_MAX_BYTES },
        stderr: { maxBytes: INSTALL_OUTPUT_MAX_BYTES },
      },
      graceMs: INSTALL_GRACE_MS,
      ...signal === undefined ? {} : { signal },
    } satisfies SubprocessSpawnSpec)
    const outcome = await handle.done
    return {
      exitCode: outcome.exitCode,
      stdout: handle.collected.stdout?.readFrom(0).text ?? '',
      stderr: handle.collected.stderr?.readFrom(0).text ?? '',
    }
  }
}

export default PluginInstallService
