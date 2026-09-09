/**
 * The install capability: target validation, profile derivation, and the
 * argv install over the real service with a recording process seam.
 */
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { PluginCatalogEntry } from '@deepseek-ai/dsh-plugin-catalog'
import type { SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import PluginInstallService, { PluginInstallError } from '../src/index.ts'
import { parseInstallTarget, PluginInstallTargetError } from '../src/install-target.ts'
import { resolveProfile } from '../src/profile.ts'
import * as InstallInvariant from '../src/invariant.ts'

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

/** Recorded spawn requests plus the outcome the fake seam answers with. */
interface RecordingSubprocess {
  readonly specs: SubprocessSpawnSpec[]
  exitCode: number
  stdout: string
  stderr: string
  collected: boolean
}

/**
 * Mount the service over a fake process seam and catalog.
 * @param entries - entries the catalog serves.
 * @param config - plugin config (the profile).
 * @returns the service, the recording seam, and the catalog recorder.
 */
async function harness(
  entries: readonly PluginCatalogEntry[] = [ENTRY],
  config: { profile?: string } = { profile: 'web' },
): Promise<{ service: PluginInstallService; subprocess: RecordingSubprocess; get: ReturnType<typeof vi.fn> }> {
  const ctx = new Context()
  const subprocess: RecordingSubprocess = { specs: [], exitCode: 0, stdout: 'installed', stderr: '', collected: true }
  ctx.provide('subprocess', {
    spawn: (spec: SubprocessSpawnSpec) => {
      subprocess.specs.push(spec)
      return {
        pid: 1,
        stdin: undefined,
        stdout: undefined,
        stderr: undefined,
        collected: subprocess.collected
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
  const get = vi.fn((url: string) => Promise.resolve(entries.find(entry => entry.url === url)))
  ctx.provide('pluginCatalog', { search: vi.fn(), get } as never)
  await ctx.plugin(PluginInstallService, config)
  return { service: ctx.pluginInstall, subprocess, get }
}

describe('PluginInstallService', () => {
  it('resolves the entry, validates its target, and runs an argv install with the configured profile', async () => {
    const { service, subprocess, get } = await harness()
    const result = await service.install(ENTRY.url)
    expect(get).toHaveBeenCalledWith(ENTRY.url, undefined)
    expect(subprocess.specs).toHaveLength(1)
    const argv = subprocess.specs[0]!.argv
    expect(argv[0]).toBe(process.execPath)
    expect(argv.slice(-6)).toEqual([process.argv[1], 'plugin', '--profile', 'web', 'add', 'github:example/dsh-example'])
    expect(subprocess.specs[0]!.cwd).toBe(process.cwd())
    expect(result).toEqual({
      name: 'dsh-example',
      target: 'github:example/dsh-example',
      profile: 'web',
      output: 'installed',
    })
  })

  it('forwards the caller signal into the spawn spec', async () => {
    const { service, subprocess } = await harness()
    const controller = new AbortController()
    await service.install(ENTRY.url, controller.signal)
    expect(subprocess.specs[0]!.signal).toBe(controller.signal)
  })

  it('refuses an unknown URL and a failing installer', async () => {
    const unknown = await harness()
    await expect(unknown.service.install('https://github.com/nobody/nothing'))
      .rejects.toMatchObject({ code: 'PLUGIN_INSTALL_UNKNOWN_ENTRY' })
    expect(unknown.subprocess.specs).toHaveLength(0)

    const failing = await harness()
    failing.subprocess.exitCode = 1
    failing.subprocess.stderr = 'ERR_PNPM_FETCH_404'
    await expect(failing.service.install(ENTRY.url)).rejects.toMatchObject({ code: 'PLUGIN_INSTALL_FAILED' })
    await expect(failing.service.install(ENTRY.url)).rejects.toThrow(/ERR_PNPM_FETCH_404/)
  })

  it('names a silent failure by its exit code and tolerates a seam with no collected streams', async () => {
    const { service, subprocess } = await harness()
    subprocess.exitCode = 2
    subprocess.stdout = ''
    subprocess.stderr = ''
    subprocess.collected = false
    await expect(service.install(ENTRY.url)).rejects.toThrow(/exit code 2$/)
  })

  it('fails closed when the CLI entry cannot be re-invoked', async () => {
    const { service } = await harness()
    const saved = process.argv
    process.argv = [saved[0] ?? 'node']
    try {
      await expect(service.install(ENTRY.url)).rejects.toMatchObject({ code: 'PLUGIN_INSTALL_NO_ENTRY' })
    } finally {
      process.argv = saved
    }
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
    expect(resolveProfile('file:///home/u/.dsh/profiles/web/node_modules/@deepseek-ai/dsh-plugin-install/lib/index.js', undefined)).toBe('web')
    expect(resolveProfile('file:///repo/packages/workbench/plugin-install/src/index.ts', 'standard')).toBe('standard')
    expect(() => resolveProfile('file:///repo/packages/workbench/plugin-install/src/index.ts', undefined)).toThrow(/cannot determine the active profile/)
  })
})

describe('plugin-install invariant companion', () => {
  it('declares its companion identity and explained empty invariant', () => {
    expect(InstallInvariant.name).toBe('plugin-install-invariant')
    expect(InstallInvariant.inject).toEqual(['invariants'])
    expect(new PluginInstallError('x', 'CODE').name).toBe('PluginInstallError')
  })
})
