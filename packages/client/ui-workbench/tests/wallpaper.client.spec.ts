// @vitest-environment jsdom
/**
 * Wallpaper state: the store/service pair, its browser persistence, and the
 * tolerance of an absent, corrupt, or read-only storage.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createWallpaper } from '../src/client/wallpaper.ts'

const KEY = 'dsh.workbench.wallpaper'
const CHOICE = { url: '/workbench/file?sessionId=s&path=%2Fw%2Fa.png', name: 'a.png' }

beforeEach(() => { localStorage.clear() })

describe('createWallpaper', () => {
  it('starts empty and persists a set choice under the namespaced key', () => {
    const { store, service } = createWallpaper()
    expect(store.getSnapshot()).toBeNull()
    service.set(CHOICE)
    expect(store.getSnapshot()).toEqual(CHOICE)
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(CHOICE)
  })

  it('restores the stored choice and clears it on clear', () => {
    localStorage.setItem(KEY, JSON.stringify(CHOICE))
    const { store, service } = createWallpaper()
    expect(store.getSnapshot()).toEqual(CHOICE)
    service.clear()
    expect(store.getSnapshot()).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('ignores unparsable, wrong-shaped, and absent stored values', () => {
    for (const raw of ['not json', '{"url":1,"name":2}', 'null', '[]']) {
      localStorage.setItem(KEY, raw)
      expect(createWallpaper().store.getSnapshot()).toBeNull()
    }
    expect(createWallpaper().store.getSnapshot()).toBeNull()
  })

  it('keeps the in-memory choice when storage refuses writes', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    try {
      const { store, service } = createWallpaper()
      service.set(CHOICE)
      expect(store.getSnapshot()).toEqual(CHOICE)
      service.clear()
      expect(store.getSnapshot()).toBeNull()
    } finally {
      setItem.mockRestore()
    }
  })
})
