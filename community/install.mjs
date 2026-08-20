/** Installs the community presets and archived-session extension into one DSH home. */
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const communityDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryDirectory = resolve(communityDirectory, '..')
const markerName = '.dsh-community-suite.json'
const ownership = { source: 'dsh-community-suite', module: 'anchored-standard' }
const presets = [
  ['anchored-standard', 'preset'],
  ['prefab-anchored-standard', 'prefab'],
  ['combo-anchored-standard', 'combo-anchored'],
  ['eternal-minimal', 'eternal-minimal'],
  ['whoami-standard', 'whoami-standard'],
  ['wire-think-standard', 'wire-think-standard'],
  ['zero-anchored-standard', 'zero-anchored-standard'],
]

function expandHome(path) {
  if (path === '~') return homedir()
  if (path.startsWith('~/') || path.startsWith('~\\')) {
    return join(homedir(), ...path.slice(2).split(/[\\/]+/).filter(Boolean))
  }
  return path
}

/** @returns {{ dshHome: string, update: boolean, presetsOnly: boolean, dshCommand: string | undefined }} */
function parseArguments() {
  const options = { dshHome: undefined, update: false, presetsOnly: false, dshCommand: undefined }
  const valueFlags = new Set(['--dsh-home', '--dsh-command'])
  const booleanFlags = new Set(['--update', '--presets-only'])
  const used = new Set()

  const firstArgument = process.argv[2] === '--' ? 3 : 2
  for (let index = firstArgument; index < process.argv.length; index += 1) {
    const argument = process.argv[index]
    if (!valueFlags.has(argument) && !booleanFlags.has(argument)) {
      throw new Error(`Unknown flag: ${argument}`)
    }
    if (used.has(argument)) {
      throw new Error(`Duplicate flag: ${argument}`)
    }
    used.add(argument)

    if (valueFlags.has(argument)) {
      const value = process.argv[index + 1]
      if (value === undefined || value.startsWith('--') || value.trim() === '') {
        throw new Error(`Missing value for ${argument}`)
      }
      index += 1
      if (argument === '--dsh-home') options.dshHome = value
      else options.dshCommand = value
    } else if (argument === '--update') {
      options.update = true
    } else {
      options.presetsOnly = true
    }
  }

  const environmentHome = process.env.DSH_HOME?.trim() || undefined
  return {
    ...options,
    dshHome: resolve(expandHome(options.dshHome ?? environmentHome ?? join(homedir(), '.dsh'))),
  }
}

async function lstatOrUndefined(path) {
  try {
    return await lstat(path)
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
}

function isRealDirectory(information) {
  return information.isDirectory() && !information.isSymbolicLink()
}

async function ensureRealDirectory(path, description) {
  let information = await lstatOrUndefined(path)
  if (information === undefined) {
    await mkdir(path, { recursive: true })
    information = await lstat(path)
  }
  if (!isRealDirectory(information)) throw new Error(`${description} must be a real directory: ${path}`)
}

async function requireRealDirectory(path, description) {
  const information = await lstatOrUndefined(path)
  if (!information || !isRealDirectory(information)) {
    throw new Error(`${description} is not a real directory: ${path}`)
  }
}

async function removeSafely(path) {
  const information = await lstatOrUndefined(path)
  if (!information) return
  if (isRealDirectory(information)) {
    await rm(path, { recursive: true, force: false })
  } else {
    await unlink(path)
  }
}

async function isOwned(destination, presetId) {
  try {
    const marker = JSON.parse(await readFile(join(destination, markerName), 'utf8'))
    return marker.source === ownership.source
      && marker.module === ownership.module
      && marker.presetId === presetId
  } catch (error) {
    if (error?.code === 'ENOENT' || error instanceof SyntaxError) return false
    throw error
  }
}

async function copyDirectoryContents(source, destination) {
  for (const entry of await readdir(source)) {
    await cp(join(source, entry), join(destination, entry), { recursive: true, force: false, errorOnExist: true })
  }
}

async function preflightPresets(options) {
  const presetsDirectory = join(options.dshHome, '.agent-presets')
  const installations = presets.map(([presetId, sourceName]) => ({
    presetId,
    source: join(communityDirectory, 'presets', 'anchored-standard', sourceName),
    destination: join(presetsDirectory, presetId),
    replacesExisting: false,
  }))

  for (const installation of installations) {
    const information = await lstatOrUndefined(installation.destination)
    if (!information) continue
    if (!options.update) throw new Error(`Preset already exists: ${installation.presetId}`)
    if (!isRealDirectory(information)) {
      throw new Error(`Preset update target is not a real directory: ${installation.presetId}`)
    }
    if (!await isOwned(installation.destination, installation.presetId)) {
      throw new Error(`Preset is not owned by dsh-community-suite: ${installation.presetId}`)
    }
    installation.replacesExisting = true
  }
  return { presetsDirectory, installations }
}

async function stagePresets(plan) {
  await ensureRealDirectory(plan.presetsDirectory, 'Preset directory')
  const staged = []
  try {
    for (const installation of plan.installations) {
      const temporary = await mkdtemp(join(plan.presetsDirectory, '.dsh-community-suite-'))
      try {
        await copyDirectoryContents(installation.source, temporary)
        await writeFile(join(temporary, markerName), `${JSON.stringify({ ...ownership, presetId: installation.presetId }, null, 2)}\n`)
        staged.push({ ...installation, temporary })
      } catch (error) {
        await removeSafely(temporary)
        throw error
      }
    }
    return staged
  } catch (error) {
    await cleanupStaging(staged)
    throw error
  }
}

async function cleanupStaging(staged) {
  await Promise.allSettled(staged.map(({ temporary }) => removeSafely(temporary)))
}

async function reserveBackupRoot(dshHome) {
  const backupsDirectory = join(dshHome, 'backups')
  await ensureRealDirectory(backupsDirectory, 'Backup directory')
  const timestamp = new Date().toISOString().replaceAll(':', '-')
  return mkdtemp(join(backupsDirectory, `dsh-community-suite-${timestamp}-`))
}

function backupRootReservation(dshHome) {
  let root
  return async () => {
    root ??= await reserveBackupRoot(dshHome)
    return root
  }
}

async function backupWebProfile(dshHome, getBackupRoot) {
  const profileDirectory = join(dshHome, 'profiles', 'web')
  const filenames = ['package.json', 'pnpm-lock.yaml', 'cordis.patch.yml']
  const existing = []
  for (const filename of filenames) {
    const source = join(profileDirectory, filename)
    if (await lstatOrUndefined(source)) existing.push({ filename, source })
  }
  if (existing.length === 0) return

  const destinationDirectory = join(await getBackupRoot(), 'profile-web')
  await mkdir(destinationDirectory, { recursive: true })
  for (const { filename, source } of existing) {
    await cp(source, join(destinationDirectory, filename), { force: false, errorOnExist: true })
  }
}

async function publishPresets(staged, getBackupRoot) {
  const moved = []
  const published = []
  try {
    for (const installation of staged) {
      if (!installation.replacesExisting) continue
      await requireRealDirectory(installation.destination, `Preset update target ${installation.presetId}`)
      if (!await isOwned(installation.destination, installation.presetId)) {
        throw new Error(`Preset is no longer owned by dsh-community-suite: ${installation.presetId}`)
      }
      const backup = join(await getBackupRoot(), 'presets', installation.presetId)
      await mkdir(dirname(backup), { recursive: true })
      await rename(installation.destination, backup)
      moved.push({ installation, backup })
    }

    for (const installation of staged) {
      await rename(installation.temporary, installation.destination)
      published.push(installation)
    }
  } catch (error) {
    for (const installation of published.toReversed()) {
      try {
        await rename(installation.destination, installation.temporary)
      } catch {
        // Preserve the original publication failure after a best-effort rollback.
      }
    }
    for (const { installation, backup } of moved.toReversed()) {
      try {
        if (!await lstatOrUndefined(installation.destination)) await rename(backup, installation.destination)
      } catch {
        // Preserve the original publication failure after a best-effort rollback.
      }
    }
    throw error
  }
}

function installBundle(options) {
  const bundle = join(communityDirectory, 'bundles', 'archived-sessions')
  const args = options.dshCommand
    ? [options.dshCommand, 'plugin', '--profile', 'web', 'add', bundle]
    : ['--import', 'tsx/esm', 'apps/cli/src/bin.ts', 'plugin', '--profile', 'web', 'add', bundle]
  const result = spawnSync(process.execPath, args, {
    cwd: repositoryDirectory,
    env: { ...process.env, DSH_HOME: options.dshHome },
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`DSH plugin installation failed with exit code ${result.status}`)
}

async function main() {
  const options = parseArguments()
  const plan = await preflightPresets(options)
  const staged = await stagePresets(plan)
  const getBackupRoot = backupRootReservation(options.dshHome)
  try {
    if (!options.presetsOnly) {
      await backupWebProfile(options.dshHome, getBackupRoot)
      installBundle(options)
    }
    await publishPresets(staged, getBackupRoot)
  } finally {
    await cleanupStaging(staged)
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
