/**
 * Listing arithmetic: which directory encloses a listing. The panels share the
 * helper, so its edge cases are asserted here rather than only through a
 * rendered panel.
 */
import { describe, expect, it } from 'vitest'
import { parentPath } from '../src/client/listing.ts'

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
