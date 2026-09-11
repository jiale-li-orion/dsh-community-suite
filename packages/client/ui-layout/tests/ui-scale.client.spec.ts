// @vitest-environment jsdom
/**
 * Interface scale: which value a device opens with, and what applying and
 * remembering one writes.
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  applyUiScale, NARROW_DEFAULT_SCALE, readUiScale, rememberUiScale, UI_SCALES,
} from '@deepseek-ai/dsh-client-ui-layout/src/client/ui-scale.ts'

afterEach(() => {
  window.localStorage.clear()
  document.documentElement.style.removeProperty('zoom')
})

describe('readUiScale', () => {
  it('opens a narrow frame smaller than a wide one', () => {
    window.innerWidth = 390
    expect(readUiScale()).toBe(NARROW_DEFAULT_SCALE)
    window.innerWidth = 1400
    expect(readUiScale()).toBe(1)
  })

  it('prefers what this device stored', () => {
    window.innerWidth = 1400
    rememberUiScale(0.9)
    expect(readUiScale()).toBe(0.9)
  })

  it('falls back to the frame default for a stored value that is not a step', () => {
    window.innerWidth = 390
    window.localStorage.setItem('dsh.ui-scale', '0.42')
    expect(readUiScale()).toBe(NARROW_DEFAULT_SCALE)
  })
})

describe('applyUiScale', () => {
  it('writes the scale onto the document element', () => {
    applyUiScale(0.8, document.documentElement)
    expect(document.documentElement.style.getPropertyValue('zoom')).toBe('0.8')
  })

  it('offers the smallest step first so a control reads small to large', () => {
    expect([...UI_SCALES]).toEqual([...UI_SCALES].sort((a, b) => a - b))
    expect(UI_SCALES).toContain(NARROW_DEFAULT_SCALE)
  })

  it('applies without remembering, so booting a default is not a choice', () => {
    applyUiScale(0.7, document.documentElement)
    expect(window.localStorage.getItem('dsh.ui-scale')).toBeNull()
  })
})
