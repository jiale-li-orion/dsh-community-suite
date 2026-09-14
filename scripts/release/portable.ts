/**
 * Assemble a portable Meshfin distribution: the harness's packed tarballs
 * installed into one directory, a Node runtime beside them, the community
 * modules installed into that directory's own home, and a launcher.
 *
 * The consumer installs nothing and builds nothing. The bytes come from
 * `pack.ts` output, so a distribution carries exactly what the npm release
 * publishes, plus a runtime and a launcher the consumer would otherwise provide.
 *
 * Layout of the assembled tree:
 *
 * ```text
 * meshfin/
 * ├── app/            npm prefix: node_modules holding the packed harness
 * ├── node/           the bundled runtime (`node/bin/node`, `node/node.exe`)
 * ├── data/           the distribution's own DSH home, community modules installed
 * ├── community/      the installer and its assets, kept for later updates
 * └── meshfin(.ps1)   the launcher
 * ```
 */

import { chmodSync, cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { capture, isEntry } from './process.ts'

/** Which launcher a distribution ships: `meshfin` or `meshfin.ps1`. */
type Platform = 'posix' | 'windows'

/** The CLI package whose bin path both launchers run. */
const CLI_PACKAGE = '@deepseek-ai/dsh'

/** Where the CLI package keeps its entry inside an installed prefix. */
const CLI_ENTRY = ['node_modules', ...CLI_PACKAGE.split('/'), 'lib', 'bin.js']

/** The part of a packed tarball's manifest a distribution decides with. */
interface PackedManifest {
  /** The package's name, which is the directory it occupies. */
  name?: string
  /** The package's declared runtime dependencies. */
  dependencies?: Record<string, string>
}

/**
 * Read one packed tarball's manifest.
 * @param tarball - absolute path of the tarball.
 * @returns the manifest fields a distribution build reads.
 */
function packedManifest(tarball: string): PackedManifest {
  return JSON.parse(capture('tar', ['-xzOf', tarball, 'package/package.json'])) as PackedManifest
}

/**
 * Install the packed harness into the distribution's `app` prefix.
 *
 * The harness packages are extracted from their own tarballs rather than
 * resolved by npm: they are already built, they depend on each other by
 * workspace version, and a manifest naming hundreds of local tarballs makes
 * npm's resolver fail outright. What npm still does is fetch the external
 * dependencies, which is the part a distribution cannot carry in the repository.
 * `--legacy-peer-deps` keeps it from pulling a second copy of the vendored
 * framework from the registry over the one extracted here.
 * @param root - the distribution root.
 * @param tarballs - every packed tarball directory.
 * @param scripts - whether dependency install scripts run (they need a toolchain).
 */
function installHarness(root: string, tarballs: readonly string[], scripts: boolean, platform: Platform): void {
  const app = join(root, 'app')
  const modules = join(app, 'node_modules')
  mkdirSync(modules, { recursive: true })
  const packed = [] as { tarball: string; name: string }[]
  const external = new Map<string, string>()
  for (const directory of tarballs) {
    for (const filename of readdirSync(directory).filter(name => name.endsWith('.tgz')).sort()) {
      const tarball = join(directory, filename)
      const manifest = packedManifest(tarball)
      const name = manifest.name
      if (name === undefined) throw new Error(`${tarball} carries no package name`)
      packed.push({ tarball, name })
      for (const [dependency, range] of Object.entries(manifest.dependencies ?? {})) {
        if (dependency.startsWith('@deepseek-ai/')) continue
        external.set(dependency, range)
      }
    }
  }
  writeFileSync(join(app, 'package.json'), `${JSON.stringify({
    name: 'meshfin',
    version: '0.0.0',
    private: true,
    dependencies: Object.fromEntries([...external].sort()),
  }, null, 2)}\n`)
  capture('npm', [
    // Optional dependencies stay IN: they are where a native package ships its
    // per-platform binary (`sharp` is the one this distribution needs), and npm
    // installs only the optional entries matching the build platform. A
    // platform whose optional native package fails is simply missing that
    // capability, which is what optional means.
    'install', '--no-audit', '--no-fund', '--package-lock=false', '--legacy-peer-deps',
    // A distribution is assembled on whatever machine the maintainer has, while
    // a native dependent ships a per-platform binary: the install must ask for
    // the platform being PACKAGED, not the platform doing the packaging.
    ...platform === 'windows' ? ['--os=win32', '--cpu=x64'] : [],
    // A distribution ships JavaScript. Two packages in the closure (`koffi`,
    // `node-pty`) are native and want a prebuilt binary or a toolchain; a
    // consumer is not expected to have either, so their install scripts are
    // skipped and the capabilities they back (the persistent terminal) are
    // simply absent from this tree.
    ...scripts ? [] : ['--ignore-scripts'],
  ], {
    cwd: app,
    // The cache stays inside the tree: a distribution build must not depend on
    // the builder's home directory being writable.
    env: { ...process.env, npm_config_cache: join(root, '.npm-cache') },
  })
  // The harness packages are extracted AFTER npm has run: npm prunes every
  // directory its own manifest does not name, so extracting first would leave a
  // prefix holding only external dependencies.
  for (const { tarball, name } of packed) {
    const target = join(modules, ...name.split('/'))
    mkdirSync(target, { recursive: true })
    capture('tar', ['-xzf', tarball, '-C', target, '--strip-components=1'], { cwd: root })
  }
  rmSync(join(root, '.npm-cache'), { recursive: true, force: true })
}

/**
 * Carry the desktop launcher into the distribution.
 *
 * The launcher is not part of the harness's packages: it is the Windows and
 * Linux plumbing that turns "there is a server somewhere" into a double-click —
 * a shortcut creator, a launcher that opens the browser only once the port
 * answers, a WSL lifetime owner, and the optional desktop tile with its default
 * skins.
 * @param root - the distribution root.
 * @param repository - the repository root holding `apps/desktop-launcher/`.
 * @param platform - which platform's scripts need an executable bit.
 */
function installDesktop(root: string, repository: string, platform: Platform): void {
  const source = join(repository, 'apps', 'desktop-launcher')
  const target = join(root, 'desktop')
  cpSync(source, target, { recursive: true })
  if (platform !== 'posix') return
  for (const script of ['wsl/meshfin-web.sh', 'linux/install-desktop-entry.sh']) {
    chmodSync(join(target, script), 0o755)
  }
}

/**
 * Copy the native addon's per-platform packages beside the extracted harness.
 *
 * `@deepseek-ai/dsh-sandbox-local` imports the Landlock launcher by name, and
 * that package is published outside the two release families this step packs:
 * its entry is supplied as a tarball and its per-platform payloads are
 * repository directories. Without them the sandbox row cannot be imported and
 * the plugin tree fails to load, so a distribution carries them directly.
 * @param root - the distribution root.
 * @param repository - the repository root holding `native/`.
 */
function installNativePayloads(root: string, repository: string, platform: Platform): void {
  // The Landlock payloads are Linux launchers; a Windows package uses the ACL sandbox instead.
  if (platform === 'windows') return
  const packages = join(repository, 'native', 'landlock-run', 'packages')
  let names: string[]
  try {
    names = readdirSync(packages).filter(name => name !== 'entry')
  } catch {
    // A checkout without the native payload directory has nothing to carry.
    return
  }
  for (const name of names) {
    const source = join(packages, name)
    const manifest = join(source, 'package.json')
    let packageName: string
    try {
      packageName = (JSON.parse(readFileSync(manifest, 'utf8')) as PackedManifest).name ?? ''
    } catch {
      continue
    }
    if (packageName === '') continue
    const target = join(root, 'app', 'node_modules', ...packageName.split('/'))
    mkdirSync(target, { recursive: true })
    cpSync(source, target, { recursive: true })
  }
}

/**
 * Copy a Node runtime binary into the distribution.
 * @param root - the distribution root.
 * @param binary - the Node binary to carry.
 * @param platform - which file name the launcher expects.
 */
function installRuntime(root: string, binary: string, platform: Platform): void {
  const target = platform === 'posix' ? join(root, 'node', 'bin', 'node') : join(root, 'node', 'node.exe')
  mkdirSync(join(root, 'node', ...platform === 'posix' ? ['bin'] : []), { recursive: true })
  cpSync(binary, target)
  if (platform === 'posix') chmodSync(target, 0o755)
}

/**
 * Install the community modules into the distribution's own home.
 *
 * The installer is a repository-layout tool — it resolves the CLI through
 * `apps/cli/src/bin.ts` — so it cannot run from inside an assembled tree. It
 * runs from the checkout and writes the distribution's home, while the
 * distribution keeps its own copy so a later update can run against that home.
 * @param root - the distribution root.
 * @param repository - the repository root holding `community/`.
 */
function installCommunity(root: string, repository: string): void {
  cpSync(join(repository, 'community'), join(root, 'community'), { recursive: true })
  capture(process.execPath, [
    join(repository, 'community', 'install.mjs'),
    '--dsh-home', join(root, 'data'),
  ], { cwd: repository })
}

/**
 * Write the launcher that runs the bundled CLI under the distribution's home.
 * @param root - the distribution root.
 * @param platform - which launcher to write.
 */
function writeLauncher(root: string, platform: Platform): void {
  const entry = CLI_ENTRY.join('/')
  if (platform === 'posix') {
    const launcher = join(root, 'meshfin')
    writeFileSync(launcher, [
      '#!/bin/sh',
      '# Meshfin: run this distribution\'s harness. DSH_HOME defaults to the',
      '# distribution\'s own data directory, so nothing is written outside it.',
      'set -e',
      'here=$(cd -- "$(dirname -- "$0")" && pwd)',
      ': "${DSH_HOME:=$here/data}"',
      'export DSH_HOME',
      `exec "$here/node/bin/node" "$here/app/${entry}" "$@"`,
      '',
    ].join('\n'))
    chmodSync(launcher, 0o755)
    return
  }
  const windowsEntry = CLI_ENTRY.join('\\')
  writeFileSync(join(root, 'meshfin.ps1'), [
    '# Meshfin: run this distribution\'s harness. DSH_HOME defaults to the',
    '# distribution\'s own data directory, so nothing is written outside it.',
    "$ErrorActionPreference = 'Stop'",
    '$here = Split-Path -Parent $MyInvocation.MyCommand.Path',
    "if (-not $env:DSH_HOME) { $env:DSH_HOME = Join-Path $here 'data' }",
    `& (Join-Path $here 'node\\node.exe') (Join-Path $here 'app\\${windowsEntry}') @args`,
    'exit $LASTEXITCODE',
    '',
  ].join('\r\n'))
}

/**
 * Assemble one distribution.
 * @param root - the repository root.
 * @param options - the distribution's tarball directories, output directory, Node binary, and platform.
 */
function assemble(
  root: string,
  options: { tarballs: readonly string[]; out: string; runtime: string; platform: Platform; scripts: boolean },
): void {
  const out = resolve(root, options.out)
  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })
  installHarness(out, options.tarballs.map(directory => resolve(root, directory)), options.scripts, options.platform)
  installDesktop(out, root, options.platform)
  installNativePayloads(out, root, options.platform)
  installRuntime(out, resolve(root, options.runtime), options.platform)
  installCommunity(out, root)
  writeLauncher(out, options.platform)
  console.log(`release portable: assembled ${out}`)
}

/** Assemble the distribution named by `--tarballs`/`--out`/`--runtime`/`--platform`. */
function main(): void {
  const { values } = parseArgs({
    options: {
      tarballs: { type: 'string', multiple: true },
      out: { type: 'string' },
      runtime: { type: 'string' },
      platform: { type: 'string' },
      'with-scripts': { type: 'boolean' },
    },
    allowPositionals: false,
  })
  if (values.tarballs === undefined || values.out === undefined || values.runtime === undefined) {
    throw new Error('usage: portable.ts --tarballs <directory> [--tarballs <directory>] --out <directory> --runtime <node directory> [--platform posix|windows]')
  }
  const platform = values.platform ?? 'posix'
  if (platform !== 'posix' && platform !== 'windows') throw new Error(`unknown platform ${platform}`)
  assemble(process.cwd(), {
    tarballs: values.tarballs,
    out: values.out,
    runtime: values.runtime,
    platform,
    scripts: values['with-scripts'] === true,
  })
}

if (isEntry(import.meta.url)) main()
