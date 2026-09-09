/**
 * Listing arithmetic: which directory encloses a listing, and which entries the
 * wallpaper panel offers. Both are pure functions the panels share, so their
 * edge cases are asserted here rather than only through a rendered panel.
 */
import { describe, expect, it } from 'vitest'
import type { WorkbenchDirEntry } from '@deepseek-ai/dsh-workbench/types'
import { parentPath, selectWallpaperEntries } from '../src/client/listing.ts'

describe('parentPath', () => {
  it('returns null for the workspace root', () => {
    expect(parentPath('/w', '/w')).toBeNull()
  })

  it('cuts one POSIX segment', () => {
    expect(parentPath('/w/src/deep', '/w')).toBe('/w/src')
  })

  it('cuts one Windows segment', () => {
    expect(parentPath('C:\\w\\src\\deep', 'C:\\w')).toBe('C:\\w\\src')
  })

  it('clamps to the root when cutting would leave a shorter path', () => {
    expect(parentPath('C:\\a', 'C:\\')).toBe('C:\\')
    expect(parentPath('/w/a', '/w/')).toBe('/w/')
  })

  it('returns the root when the path carries no separator', () => {
    expect(parentPath('a', '/w')).toBe('/w')
  })
})

describe('selectWallpaperEntries', () => {
  const entries: readonly WorkbenchDirEntry[] = [
    { name: 'src', type: 'directory', path: '/w/src' },
    { name: 'photo.png', type: 'file', path: '/w/photo.png', mediaType: 'image/png' },
    { name: 'notes.txt', type: 'file', path: '/w/notes.txt', mediaType: 'text/plain' },
    { name: 'typel', type: 'file', path: '/w/typel' },
    { name: 'socket', type: 'other', path: '/w/socket' },
  ]

  it('keeps directories and image files in listing order and drops the rest', () => {
    expect(selectWallpaperEntries(entries)).toEqual({
      directories: [entries[0]],
      images: [entries[1]],
    })
  })

  it('offers nothing for an empty listing', () => {
    expect(selectWallpaperEntries([])).toEqual({ directories: [], images: [] })
  })
})
