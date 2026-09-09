/**
 * Post-build gate for every client bundle's module table.
 *
 * A client bundle runs inside the browser's frozen module table: its `require`
 * may only name a platform seed module, a shell-owned static, or another
 * registered plugin bundle. Anything else — the classic case being generated
 * Remote code that pulls a validation library the owning manifest never
 * declared, so the bundler leaves it external — loads the plugin page into
 * "Failed to load plugins" with the server still up, which is exactly the
 * failure a rebuild and restart would not fix. This gate executes each built
 * bundle's registration envelope, then checks every literal `require` against
 * the table before anything is served.
 * @module scripts/verify-client-bundles
 */

import { existsSync, globSync, readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { runInNewContext } from 'node:vm'

const root = resolve(import.meta.dirname, '..')

/**
 * The platform seed words. Read from the shell's own source rather than
 * imported: `packages/client/web` belongs to the Client compiler face, and a
 * host-face gate may not pull a client project file into its program. The floor
 * assertion below makes a drifted parse fail loud instead of silently widening
 * the allowed table.
 * @returns the seed specifiers.
 */
function platformModules(): readonly string[] {
  const source = readFileSync(resolve(root, 'packages/client/web/src/platform.ts'), 'utf8')
  const match = /PLATFORM_MODULES\s*=\s*\[([\s\S]*?)\]\s*as const/.exec(source)
  const body = match?.[1] ?? ''
  const words = [...body.matchAll(/'([^']+)'/g)].flatMap(word => word[1] ?? [])
  if (words.length < 5 || !words.includes('react')) {
    throw new Error('verify-client-bundles: cannot read PLATFORM_MODULES from packages/client/web/src/platform.ts')
  }
  return words
}

/** Shell-owned statics the module table answers in addition to the seed words. */
const SHELL_STATICS = new Set([
  '@deepseek-ai/dsh-client-web',
  '@deepseek-ai/dsh-client-modules',
])

/** One client bundle the gate inspected. */
export interface ClientBundle {
  /** Owning package name (also the registration id). */
  readonly id: string
  /** Repo-relative bundle path. */
  readonly path: string
  /** The bundle source. */
  readonly source: string
}

/** One violation found in a bundle. */
export interface Violation {
  /** Repo-relative bundle path. */
  readonly path: string
  /** What is wrong. */
  readonly message: string
}

/** Every literal specifier a bundle requires at materialization. */
const REQUIRE = /\brequire\("([^"]+)"\)/g

/** Manifest fields the discovery reads. */
interface Manifest {
  readonly name?: string
  readonly exports?: Record<string, unknown>
}

/**
 * Read one package manifest, or undefined when it has none.
 * @param path - repo-relative manifest path.
 * @returns the parsed manifest.
 */
function readManifest(path: string): Manifest {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8')) as Manifest
}

/**
 * The runtime default of one export subpath, when it is a string target.
 * @param manifest - the owning manifest.
 * @param subpath - export key such as `./client`.
 * @returns the target path, or undefined when the subpath is absent.
 */
function exportDefault(manifest: Manifest, subpath: string): string | undefined {
  const entry = manifest.exports?.[subpath]
  if (typeof entry === 'string') return entry
  if (typeof entry === 'object' && entry !== null) {
    const fallback = (entry as { default?: unknown }).default
    if (typeof fallback === 'string') return fallback
  }
  return undefined
}

/** Discover every built client bundle and its owning package name. */
function discover(): ClientBundle[] {
  const bundles: ClientBundle[] = []
  for (const manifestPath of globSync('packages/*/*/package.json', { cwd: root }).map(path => path.split(sep).join('/'))) {
    const manifest = readManifest(manifestPath)
    const target = exportDefault(manifest, './client')
    if (manifest.name === undefined || target === undefined) continue
    // Only the tsdown client bundle is a browser plugin bundle; a `./client`
    // subpath pointing at the emitted ESM tree is a browser-safe source
    // channel (apiproxy, token-meter), not a registration envelope.
    if (!target.endsWith('/lib/client.js')) continue
    const bundlePath = manifestPath.slice(0, -'/package.json'.length) + '/' + target.replace(/^\.\//, '')
    if (!existsSync(resolve(root, bundlePath))) continue
    bundles.push({ id: manifest.name, path: bundlePath, source: readFileSync(resolve(root, bundlePath), 'utf8') })
  }
  return bundles.sort((left, right) => left.path.localeCompare(right.path))
}

/**
 * Execute one bundle's registration envelope and return its handoff.
 * @param bundle - the discovered bundle.
 * @returns the registered id and factory, or a violation message.
 */
function handoffOf(bundle: ClientBundle): { id: string } | string {
  const handoffs: { id: string; factory: unknown }[] = []
  const window = {
    __ModuleLoader__: {
      load: (handoff: { id: string; factory: unknown }) => { handoffs.push(handoff) },
    },
  }
  try {
    runInNewContext(bundle.source, { window, console }, { filename: bundle.path })
  } catch (error: unknown) {
    return `registration envelope threw: ${error instanceof Error ? error.message : String(error)}`
  }
  if (handoffs.length !== 1) return `registered ${String(handoffs.length)} handoffs, expected exactly one`
  const handoff = handoffs[0]
  if (handoff === undefined) return 'registered no handoff'
  return { id: handoff.id }
}

/**
 * Check every bundle against the module table.
 * @param bundles - discovered bundles.
 * @param table - every specifier the browser module table can answer.
 * @returns one entry per violation, empty when every bundle is servable.
 */
export function checkBundles(bundles: readonly ClientBundle[], table: ReadonlySet<string>): Violation[] {
  const violations: Violation[] = []
  for (const bundle of bundles) {
    const handoff = handoffOf(bundle)
    if (typeof handoff === 'string') {
      violations.push({ path: bundle.path, message: handoff })
      continue
    }
    if (handoff.id !== bundle.id) {
      violations.push({ path: bundle.path, message: `registers id ${JSON.stringify(handoff.id)}, expected the package name ${JSON.stringify(bundle.id)}` })
    }
    for (const match of bundle.source.matchAll(REQUIRE)) {
      const specifier = match[1]
      // The loader's own template `require(`${spec}`)` is not a literal edge.
      if (specifier === undefined || specifier.includes('${')) continue
      // A registered plugin may be required through its `/client` channel.
      const bare = specifier.endsWith('/client') ? specifier.slice(0, -'/client'.length) : specifier
      if (table.has(specifier) || table.has(bare)) continue
      violations.push({
        path: bundle.path,
        message: `require(${JSON.stringify(specifier)}) is not a platform seed module, a shell static, or a registered plugin bundle — `
          + 'the browser module table cannot answer it (declare the dependency so the bundler inlines it, or import it type-only)',
      })
    }
  }
  return violations
}

/** Run the gate over the built tree. */
function main(): void {
  const bundles = discover()
  if (bundles.length === 0) {
    console.error('verify-client-bundles: no built client bundle found — run `pnpm run build:lib:client` first')
    process.exit(1)
  }
  const table = new Set<string>([...platformModules(), ...SHELL_STATICS, ...bundles.map(bundle => bundle.id)])
  const violations = checkBundles(bundles, table)
  if (violations.length > 0) {
    console.error(`verify-client-bundles: ${String(violations.length)} violation(s):`)
    for (const violation of violations) console.error(`  ${violation.path}: ${violation.message}`)
    process.exit(1)
  }
  console.log(`verify-client-bundles: ${String(bundles.length)} bundle(s) register under their package name and require only module-table words`)
}

if (process.argv[1]?.endsWith('verify-client-bundles.ts') === true) main()
