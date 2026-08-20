import assert from 'node:assert/strict'
import { chmod, lstat, mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const communityDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryDirectory = resolve(communityDirectory, '..')
const installer = join(communityDirectory, 'install.mjs')
const publicPresets = [
  'anchored-standard',
  'prefab-anchored-standard',
  'combo-anchored-standard',
  'eternal-minimal',
  'whoami-standard',
  'wire-think-standard',
  'zero-anchored-standard',
]

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-community-suite-'))
  const dshHome = join(directory, 'dsh-home')
  await mkdir(dshHome)
  return {
    directory,
    dshHome,
    async cleanup() {
      await rm(directory, { recursive: true, force: true })
    },
  }
}

async function withFixture(callback) {
  const testFixture = await fixture()
  try {
    return await callback(testFixture)
  } finally {
    await testFixture.cleanup()
  }
}

function runInstaller(args, options = {}) {
  return spawnSync(process.execPath, [installer, ...args], {
    cwd: options.cwd ?? repositoryDirectory,
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
  })
}

function runCommunityScript(args, options = {}) {
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  return spawnSync(pnpm, ['run', 'community:install', '--', ...args], {
    cwd: repositoryDirectory,
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
    shell: process.platform === 'win32',
  })
}

async function marker(dshHome, presetId) {
  return JSON.parse(await readFile(join(dshHome, '.agent-presets', presetId, '.dsh-community-suite.json'), 'utf8'))
}

test('installs all seven preset ids into an empty temporary DSH home', async () => {
  await withFixture(async (testFixture) => {

  const result = runInstaller(['--dsh-home', testFixture.dshHome, '--presets-only'])

  assert.equal(result.status, 0, result.stderr)
  for (const presetId of publicPresets) {
    assert.deepEqual(await marker(testFixture.dshHome, presetId), {
      source: 'dsh-community-suite',
      module: 'anchored-standard',
      presetId,
    })
  }
  })
})

test('refuses an existing preset without --update', async () => {
  await withFixture(async (testFixture) => {
  const destination = join(testFixture.dshHome, '.agent-presets', 'anchored-standard')
  await mkdir(destination, { recursive: true })
  await writeFile(join(destination, 'keep.txt'), 'foreign preset')

  const result = runInstaller(['--dsh-home', testFixture.dshHome, '--presets-only'])

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /already exists/)
  assert.equal(await readFile(join(destination, 'keep.txt'), 'utf8'), 'foreign preset')
  })
})

test('backs up and replaces an owned preset with --update', async () => {
  await withFixture(async (testFixture) => {
  const firstInstall = runInstaller(['--dsh-home', testFixture.dshHome, '--presets-only'])
  assert.equal(firstInstall.status, 0, firstInstall.stderr)
  const destination = join(testFixture.dshHome, '.agent-presets', 'anchored-standard')
  await writeFile(join(destination, 'stale.txt'), 'replace me')

  const result = runInstaller(['--dsh-home', testFixture.dshHome, '--presets-only', '--update'])

  assert.equal(result.status, 0, result.stderr)
  await assert.rejects(stat(join(destination, 'stale.txt')))
  const backupRoots = await readdir(join(testFixture.dshHome, 'backups'))
  assert.equal(backupRoots.length, 1)
  const backup = join(testFixture.dshHome, 'backups', backupRoots[0], 'presets', 'anchored-standard')
  assert.equal(await readFile(join(backup, 'stale.txt'), 'utf8'), 'replace me')
  assert.deepEqual(await marker(testFixture.dshHome, 'anchored-standard'), {
    source: 'dsh-community-suite',
    module: 'anchored-standard',
    presetId: 'anchored-standard',
  })
  })
})

test('passes only the web profile and local bundle path to dsh plugin add', async () => {
  await withFixture(async (testFixture) => {
  const recordingCommand = join(testFixture.directory, 'record-command.mjs')
  const recordPath = join(testFixture.directory, 'record.json')
  const profileDirectory = join(testFixture.dshHome, 'profiles', 'web')
  await mkdir(profileDirectory, { recursive: true })
  for (const name of ['package.json', 'pnpm-lock.yaml', 'cordis.patch.yml']) {
    await writeFile(join(profileDirectory, name), `saved ${name}`)
  }
  await writeFile(recordingCommand, `import { writeFileSync } from 'node:fs'; writeFileSync(process.env.RECORD_PATH, JSON.stringify({ argv: process.argv.slice(2), dshHome: process.env.DSH_HOME, inherited: process.env.INHERITED_SENTINEL }));`)

  const result = runInstaller(['--dsh-home', testFixture.dshHome, '--dsh-command', recordingCommand], {
    env: { RECORD_PATH: recordPath, INHERITED_SENTINEL: 'present' },
  })

  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(await readFile(recordPath, 'utf8')), {
    argv: ['plugin', '--profile', 'web', 'add', join(repositoryDirectory, 'community', 'bundles', 'archived-sessions')],
    dshHome: testFixture.dshHome,
    inherited: 'present',
  })
  const backupRoots = await readdir(join(testFixture.dshHome, 'backups'))
  assert.equal(backupRoots.length, 1)
  for (const name of ['package.json', 'pnpm-lock.yaml', 'cordis.patch.yml']) {
    assert.equal(await readFile(join(testFixture.dshHome, 'backups', backupRoots[0], 'profile-web', name), 'utf8'), `saved ${name}`)
  }
  })
})

test('never reads or writes the sessions directory', async () => {
  await withFixture(async (testFixture) => {
  const sessions = join(testFixture.dshHome, 'sessions')
  await mkdir(sessions)
  await writeFile(join(sessions, 'sentinel'), 'unchanged')
  const before = await stat(sessions)
  await chmod(sessions, 0o000)

  try {
    const result = runInstaller(['--dsh-home', testFixture.dshHome, '--presets-only'])
    assert.equal(result.status, 0, result.stderr)
  } finally {
    await chmod(sessions, 0o700)
  }

  const after = await stat(sessions)
  assert.equal(await readFile(join(sessions, 'sentinel'), 'utf8'), 'unchanged')
  assert.equal(after.mtimeMs, before.mtimeMs)
  })
})

test('rejects malformed flags before creating the DSH home', async () => {
  await withFixture(async (testFixture) => {
  const absentHome = join(testFixture.directory, 'absent-home')

  for (const args of [
    ['--dsh-home', absentHome, '--unknown'],
    ['--dsh-home', absentHome, '--dsh-home', absentHome],
    ['--dsh-home'],
    ['--dsh-home', absentHome, '--'],
    ['--', '--', '--dsh-home', absentHome],
  ]) {
    const result = runInstaller(args)
    assert.notEqual(result.status, 0)
    await assert.rejects(stat(absentHome))
  }
  })
})

test('accepts pnpm’s single leading argument separator', async () => {
  await withFixture(async (testFixture) => {
    const environmentHome = join(testFixture.directory, 'environment-home')

    const result = runCommunityScript(['--dsh-home', testFixture.dshHome, '--presets-only'], {
      env: { DSH_HOME: environmentHome },
    })

    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(await marker(testFixture.dshHome, 'anchored-standard'), {
      source: 'dsh-community-suite',
      module: 'anchored-standard',
      presetId: 'anchored-standard',
    })
    await assert.rejects(stat(environmentHome))
  })
})

test('falls back to HOME/.dsh when DSH_HOME is blank without writing the working directory', async () => {
  await withFixture(async (testFixture) => {
    const fakeHome = join(testFixture.directory, 'fake-home')
    const workingDirectory = join(testFixture.directory, 'working-directory')
    await mkdir(fakeHome)
    await mkdir(workingDirectory)

    const result = runInstaller(['--presets-only'], {
      cwd: workingDirectory,
      env: { DSH_HOME: '   ', HOME: fakeHome, USERPROFILE: fakeHome },
    })

    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(await marker(join(fakeHome, '.dsh'), 'anchored-standard'), {
      source: 'dsh-community-suite',
      module: 'anchored-standard',
      presetId: 'anchored-standard',
    })
    await assert.rejects(stat(join(workingDirectory, '.agent-presets')))
  })
})

test('expands ~, ~/, and ~\\ DSH homes against the platform home directory', async () => {
  await withFixture(async (testFixture) => {
    const fakeHome = join(testFixture.directory, 'fake-home')
    const workingDirectory = join(testFixture.directory, 'working-directory')
    await mkdir(fakeHome)
    await mkdir(workingDirectory)
    const cases = [
      ['~', fakeHome],
      ['~/.tilde-slash', join(fakeHome, '.tilde-slash')],
      ['~\\tilde-backslash', join(fakeHome, 'tilde-backslash')],
    ]

    for (const [input, expectedHome] of cases) {
      const result = runInstaller(['--dsh-home', input, '--presets-only'], {
        cwd: workingDirectory,
        env: { HOME: fakeHome, USERPROFILE: fakeHome },
      })
      assert.equal(result.status, 0, result.stderr)
      assert.deepEqual(await marker(expectedHome, 'anchored-standard'), {
        source: 'dsh-community-suite',
        module: 'anchored-standard',
        presetId: 'anchored-standard',
      })
    }
    await assert.rejects(stat(join(workingDirectory, '.agent-presets')))
  })
})

test('does not publish staged presets when bundle installation fails and supports a clean retry', async () => {
  await withFixture(async (testFixture) => {
    const failingCommand = join(testFixture.directory, 'failing-command.mjs')
    const succeedingCommand = join(testFixture.directory, 'succeeding-command.mjs')
    await writeFile(failingCommand, 'process.exitCode = 7')
    await writeFile(succeedingCommand, '')

    const failed = runInstaller(['--dsh-home', testFixture.dshHome, '--dsh-command', failingCommand])
    assert.notEqual(failed.status, 0)
    const presetsDirectory = join(testFixture.dshHome, '.agent-presets')
    if (await lstat(presetsDirectory).then(() => true, () => false)) {
      assert.deepEqual(await readdir(presetsDirectory), [])
    }

    const retried = runInstaller(['--dsh-home', testFixture.dshHome, '--dsh-command', succeedingCommand])
    assert.equal(retried.status, 0, retried.stderr)
    assert.deepEqual(await marker(testFixture.dshHome, 'anchored-standard'), {
      source: 'dsh-community-suite',
      module: 'anchored-standard',
      presetId: 'anchored-standard',
    })
  })
})

test('rejects foreign, malformed, and link-shaped update destinations without changing their targets', async () => {
  await withFixture(async (testFixture) => {
    const presetsDirectory = join(testFixture.dshHome, '.agent-presets')
    await mkdir(presetsDirectory)
    const cases = [
      ['foreign', JSON.stringify({ source: 'someone-else', module: 'anchored-standard', presetId: 'anchored-standard' })],
      ['malformed', '{not json'],
    ]

    for (const [name, markerText] of cases) {
      const destination = join(presetsDirectory, 'anchored-standard')
      await mkdir(destination)
      await writeFile(join(destination, '.dsh-community-suite.json'), markerText)
      await writeFile(join(destination, 'keep.txt'), name)
      const result = runInstaller(['--dsh-home', testFixture.dshHome, '--presets-only', '--update'])
      assert.notEqual(result.status, 0)
      assert.equal(await readFile(join(destination, 'keep.txt'), 'utf8'), name)
      await rm(destination, { recursive: true })
    }

    const target = join(testFixture.directory, 'outside-target')
    const destination = join(presetsDirectory, 'anchored-standard')
    await mkdir(target)
    await writeFile(join(target, 'keep.txt'), 'outside')
    await symlink(target, destination, process.platform === 'win32' ? 'junction' : 'dir')
    const result = runInstaller(['--dsh-home', testFixture.dshHome, '--presets-only', '--update'])
    assert.notEqual(result.status, 0)
    assert.equal(await readFile(join(target, 'keep.txt'), 'utf8'), 'outside')
    assert.equal((await lstat(destination)).isSymbolicLink(), true)
  })
})

test('reserves distinct backup roots for immediate updates', async () => {
  await withFixture(async (testFixture) => {
    const installed = runInstaller(['--dsh-home', testFixture.dshHome, '--presets-only'])
    assert.equal(installed.status, 0, installed.stderr)

    const firstUpdate = runInstaller(['--dsh-home', testFixture.dshHome, '--presets-only', '--update'])
    const secondUpdate = runInstaller(['--dsh-home', testFixture.dshHome, '--presets-only', '--update'])
    assert.equal(firstUpdate.status, 0, firstUpdate.stderr)
    assert.equal(secondUpdate.status, 0, secondUpdate.stderr)
    const roots = await readdir(join(testFixture.dshHome, 'backups'))
    assert.equal(new Set(roots).size, 2)
    assert.equal(roots.length, 2)
    assert.ok(roots.every((root) => root.startsWith('dsh-community-suite-')))
  })
})

test('preserves a nested link in an owned preset backup without touching its external target', async () => {
  await withFixture(async (testFixture) => {
    const firstInstall = runInstaller(['--dsh-home', testFixture.dshHome, '--presets-only'])
    assert.equal(firstInstall.status, 0, firstInstall.stderr)
    const destination = join(testFixture.dshHome, '.agent-presets', 'anchored-standard')
    const externalTarget = join(testFixture.directory, 'external-target')
    const nestedLink = join(destination, 'external-link')
    await mkdir(externalTarget)
    await writeFile(join(externalTarget, 'sentinel.txt'), 'outside survives')
    await symlink(externalTarget, nestedLink, process.platform === 'win32' ? 'junction' : 'dir')

    const updated = runInstaller(['--dsh-home', testFixture.dshHome, '--presets-only', '--update'])

    assert.equal(updated.status, 0, updated.stderr)
    assert.equal(await readFile(join(externalTarget, 'sentinel.txt'), 'utf8'), 'outside survives')
    const backupRoots = await readdir(join(testFixture.dshHome, 'backups'))
    const backedUpLink = join(testFixture.dshHome, 'backups', backupRoots[0], 'presets', 'anchored-standard', 'external-link')
    assert.equal((await lstat(backedUpLink)).isSymbolicLink(), true)
  })
})

test('rolls back moved presets when a later publication target becomes invalid', async () => {
  await withFixture(async (testFixture) => {
    const firstInstall = runInstaller(['--dsh-home', testFixture.dshHome, '--presets-only'])
    assert.equal(firstInstall.status, 0, firstInstall.stderr)
    const presetsDirectory = join(testFixture.dshHome, '.agent-presets')
    const firstDestination = join(presetsDirectory, 'anchored-standard')
    const failingCommand = join(testFixture.directory, 'sabotage-command.mjs')
    await writeFile(join(firstDestination, 'stale.txt'), 'restore me')
    await writeFile(failingCommand, `import { renameSync, writeFileSync } from 'node:fs'; import { join } from 'node:path'; const presets = join(process.env.DSH_HOME, '.agent-presets'); renameSync(join(presets, 'zero-anchored-standard'), join(presets, 'zero-before-sabotage')); writeFileSync(join(presets, 'zero-anchored-standard'), 'not a directory');`)

    const result = runInstaller(['--dsh-home', testFixture.dshHome, '--dsh-command', failingCommand, '--update'])

    assert.notEqual(result.status, 0)
    assert.equal(await readFile(join(firstDestination, 'stale.txt'), 'utf8'), 'restore me')
    const backupRoots = await readdir(join(testFixture.dshHome, 'backups'))
    await assert.rejects(stat(join(testFixture.dshHome, 'backups', backupRoots[0], 'presets', 'anchored-standard')))
  })
})

test('rejects bundle-time ownership marker changes before moving an update destination', async () => {
  await withFixture(async (testFixture) => {
    const firstInstall = runInstaller(['--dsh-home', testFixture.dshHome, '--presets-only'])
    assert.equal(firstInstall.status, 0, firstInstall.stderr)
    const destination = join(testFixture.dshHome, '.agent-presets', 'anchored-standard')
    const tamperingCommand = join(testFixture.directory, 'tampering-command.mjs')
    const foreignMarker = JSON.stringify({ source: 'foreign-suite', module: 'anchored-standard', presetId: 'anchored-standard' })
    await writeFile(tamperingCommand, `import { writeFileSync } from 'node:fs'; import { join } from 'node:path'; writeFileSync(join(process.env.DSH_HOME, '.agent-presets', 'anchored-standard', '.dsh-community-suite.json'), ${JSON.stringify(foreignMarker)});`)

    const result = runInstaller(['--dsh-home', testFixture.dshHome, '--dsh-command', tamperingCommand, '--update'])

    assert.notEqual(result.status, 0)
    assert.equal(await readFile(join(destination, '.dsh-community-suite.json'), 'utf8'), foreignMarker)
  })
})

test('full installation does not access the protected sessions directory', async () => {
  await withFixture(async (testFixture) => {
    const sessions = join(testFixture.dshHome, 'sessions')
    const command = join(testFixture.directory, 'command.mjs')
    const guard = join(testFixture.directory, 'guard.mjs')
    await mkdir(sessions)
    await writeFile(join(sessions, 'sentinel'), 'protected bytes')
    const before = await stat(sessions)
    await writeFile(command, '')
    await writeFile(guard, `import fs from 'node:fs'; import { resolve, relative, isAbsolute } from 'node:path'; import { syncBuiltinESMExports } from 'node:module'; const target = resolve(process.env.GUARD_PATH); const inside = (value) => { if (typeof value !== 'string') return false; const rel = relative(target, resolve(value)); return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel)); }; for (const name of Object.keys(fs.promises)) { const original = fs.promises[name]; if (typeof original !== 'function') continue; fs.promises[name] = async (...args) => { if (args.slice(0, 2).some(inside)) throw new Error('protected path access: ' + name); return original(...args); }; } syncBuiltinESMExports();`)

    const result = runInstaller(['--dsh-home', testFixture.dshHome, '--dsh-command', command], {
      env: { GUARD_PATH: sessions, NODE_OPTIONS: `--import=${guard}` },
    })

    assert.equal(result.status, 0, result.stderr)
    const after = await stat(sessions)
    assert.equal(await readFile(join(sessions, 'sentinel'), 'utf8'), 'protected bytes')
    assert.equal(after.mtimeMs, before.mtimeMs)
  })
})
