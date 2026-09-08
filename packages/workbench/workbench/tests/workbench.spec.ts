/**
 * Real-composition account of the shared workbench service: the plugin mounts
 * through the real Loader plugin protocol over the real local filesystem
 * backend and a session record, commits emit the view they stored, and the
 * directory listing is fenced to that session's recorded working directory.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import { LocalFileSystem } from '@deepseek-ai/dsh-fs-local'
import { SessionId } from '@deepseek-ai/dsh-session'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import WorkbenchService, { WorkbenchFenceError } from '../src/index.ts'
import { contentTypeForPath, DEFAULT_CONTENT_TYPE } from '../src/content-type.ts'
import type { WorkbenchView } from '../src/types.ts'
import * as WorkbenchInvariant from '../src/invariant.ts'

const SESSION = SessionId('session-workbench-test')
const OTHER_SESSION = SessionId('session-workbench-other')

let root: string | undefined
const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/** Boot the service over a real temp workspace and one session record. */
async function harness() {
  root = await mkdtemp(join(tmpdir(), 'dsh-workbench-'))
  await mkdir(join(root, 'src'))
  await writeFile(join(root, 'README.md'), 'hello\n')
  await writeFile(join(root, 'src', 'index.ts'), 'export {}\n')
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(LocalFileSystem, { cwd: root })
  ctx.provide('sessions', {
    get: (id: SessionId) => (id === SESSION ? { header: { cwd: root } } : undefined),
  } as never)
  await ctx.plugin(WorkbenchService)
  return { ctx, workbench: ctx.get('workbench') as WorkbenchService }
}

describe('WorkbenchService', () => {
  it('publishes the shared view and listing methods under the workbench namespace', async () => {
    const { workbench } = await harness()
    expect(workbench.typertRemote).toMatchObject({ serviceKey: 'workbench', namespace: 'workbench' })
    expect(remoteMethods(workbench).map(entry => entry.method).sort())
      .toEqual(['close', 'listDir', 'open', 'select', 'state', 'toggle'])
  })

  it('starts closed with no selection and emits the committed view on every commit', async () => {
    const { ctx, workbench } = await harness()
    expect(workbench.state()).toEqual({ open: false, active: null })

    const seen: WorkbenchView[] = []
    ctx.on('workbench/changed', (view) => { seen.push(view) })

    expect(workbench.open('files')).toEqual({ open: true, active: 'files' })
    expect(workbench.close()).toEqual({ open: false, active: 'files' })
    expect(workbench.open(null)).toEqual({ open: true, active: 'files' })
    expect(workbench.select('git')).toEqual({ open: true, active: 'git' })
    expect(workbench.toggle()).toEqual({ open: false, active: 'git' })
    expect(workbench.toggle()).toEqual({ open: true, active: 'git' })

    expect(seen).toEqual([
      { open: true, active: 'files' },
      { open: false, active: 'files' },
      { open: true, active: 'files' },
      { open: true, active: 'git' },
      { open: false, active: 'git' },
      { open: true, active: 'git' },
    ])
    // The emitted payloads are detached copies: a later commit cannot rewrite
    // what a consumer already received.
    expect(seen[0]).not.toBe(seen[1])
  })

  it('lists the session workspace root and one nested directory through the fs capability', async () => {
    const { workbench } = await harness()
    const top = await workbench.listDir(SESSION, null)
    expect(top.root).toBe(root)
    expect(top.path).toBe(root)
    expect(top.entries.map(entry => [entry.name, entry.type])).toEqual([
      ['README.md', 'file'],
      ['src', 'directory'],
    ])
    expect(top.entries.find(entry => entry.name === 'README.md')?.size).toBe(6)
    // The media type is the listing's, so the viewer chain and the byte route
    // route on one value instead of each re-deriving it from the name.
    expect(top.entries.find(entry => entry.name === 'README.md')?.mediaType).toBe('text/plain; charset=utf-8')
    expect(top.entries.find(entry => entry.name === 'src')?.mediaType).toBeUndefined()

    const nested = await workbench.listDir(SESSION, join(root!, 'src'))
    expect(nested.path).toBe(join(root!, 'src'))
    expect(nested.entries.map(entry => entry.name)).toEqual(['index.ts'])
  })

  it('types a file by extension and falls back to a download type', () => {
    expect(contentTypeForPath('/w/a.png')).toBe('image/png')
    expect(contentTypeForPath('/w/a.JPG')).toBe('image/jpeg')
    expect(contentTypeForPath('/w/a.svg')).toBe('image/svg+xml')
    expect(contentTypeForPath('/w/a.mp3')).toBe('audio/mpeg')
    expect(contentTypeForPath('/w/a.m4a')).toBe('audio/mp4')
    expect(contentTypeForPath('/w/a.mp4')).toBe('video/mp4')
    expect(contentTypeForPath('/w/a.webm')).toBe('video/webm')
    expect(contentTypeForPath('/w/a.pdf')).toBe('application/pdf')
    expect(contentTypeForPath('/w/a.md')).toBe('text/plain; charset=utf-8')
    expect(contentTypeForPath('/w/archive.tar.gz')).toBe(DEFAULT_CONTENT_TYPE)
    expect(contentTypeForPath('/w/Makefile')).toBe(DEFAULT_CONTENT_TYPE)
    expect(contentTypeForPath('/w/trailing.')).toBe(DEFAULT_CONTENT_TYPE)
  })

  it('resolves a relative path against the session workspace root', async () => {
    const { workbench } = await harness()
    const nested = await workbench.listDir(SESSION, 'src')
    expect(nested.entries.map(entry => entry.name)).toEqual(['index.ts'])
  })

  it('refuses a listing when the session records no working directory', async () => {
    const { workbench } = await harness()
    await expect(workbench.listDir(OTHER_SESSION, null))
      .rejects.toThrow(/records no working directory/)
  })

  it('refuses a path outside the session workspace', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'dsh-workbench-outside-'))
    try {
      const { workbench } = await harness()
      await expect(workbench.listDir(SESSION, outside)).rejects.toBeInstanceOf(WorkbenchFenceError)
      await expect(workbench.listDir(SESSION, outside)).rejects.toThrow(/outside the session workspace/)
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })
})

describe('workbench invariant companion', () => {
  it('registers package ownership and accepts a matching commit', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await ctx.plugin(LocalFileSystem, { cwd: tmpdir() })
    ctx.provide('sessions', { get: () => undefined } as never)
    await ctx.plugin(WorkbenchService)
    const fiber = ctx.plugin(WorkbenchInvariant)
    await fiber.await()
    expect(WorkbenchInvariant.name).toBe('workbench-invariant')
    expect(WorkbenchInvariant.inject).toEqual(['invariants'])
    // A commit emits the state it stored, so the companion's check passes.
    const workbench = ctx.get('workbench') as WorkbenchService
    expect(() => { workbench.open('files') }).not.toThrow()
    await fiber.dispose()
  })

  it('fails a payload that is not the state the service holds', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await ctx.plugin(LocalFileSystem, { cwd: tmpdir() })
    ctx.provide('sessions', { get: () => undefined } as never)
    await ctx.plugin(WorkbenchService)
    await ctx.plugin(WorkbenchInvariant).await()
    // A stale payload reaching the event stream is exactly the desynchronization
    // the companion exists to catch, so it must fail loud.
    expect(() => {
      ctx.emit('workbench/changed', { open: true, active: 'files' })
    }).toThrow(/while the service holds/)
  })
})
