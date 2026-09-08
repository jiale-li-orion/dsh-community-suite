import { describe, expect, it } from 'vitest'
import {
  CENTER_MIN, clampWidth, computeColumns,
  DETAILS_DEFAULT, SIDEBAR_COLLAPSED, SIDEBAR_DEFAULT, SIDEBAR_MIN,
  WORKBENCH_DEFAULT, WORKBENCH_MIN,
} from '@deepseek-ai/dsh-client-ui-layout/src/client/columns.ts'

// Numeric preference form (0 = closed); helpers keep the scenario names readable.
const open = (width: number) => width
const closed = (_width: number) => 0

describe('clampWidth', () => {
  it('clamps into the range and rounds', () => {
    expect(clampWidth(250.4, 240, 420)).toBe(250)
    expect(clampWidth(100, 240, 420)).toBe(240)
    expect(clampWidth(9999, 240, 420)).toBe(420)
  })
})

describe('computeColumns', () => {
  it('step 1: everything fits at preferred widths', () => {
    const cols = computeColumns(
      1920,
      open(SIDEBAR_DEFAULT),
      open(WORKBENCH_DEFAULT),
      open(DETAILS_DEFAULT),
    )
    expect(cols).toEqual({
      sidebar: 280,
      center: 1920 - 280 - 560 - 360,
      workbench: 560,
      details: 360,
    })
  })

  it('closed sidebar keeps its compact rail while closed workbench and details contribute zero width', () => {
    expect(computeColumns(1920, closed(300), closed(560), closed(360)))
      .toEqual({ sidebar: SIDEBAR_COLLAPSED, center: 1920 - SIDEBAR_COLLAPSED, workbench: 0, details: 0 })
  })

  it('preferences beyond the clamp range are clamped before solving', () => {
    const cols = computeColumns(3000, open(9999), open(9999), open(1))
    expect(cols.sidebar).toBe(420)
    expect(cols.workbench).toBe(1200)
    expect(cols.details).toBe(300)
    expect(computeColumns(3000, open(1), open(1), open(DETAILS_DEFAULT)).sidebar).toBe(SIDEBAR_MIN)
    expect(computeColumns(3000, open(SIDEBAR_DEFAULT), open(1), open(DETAILS_DEFAULT)).workbench)
      .toBe(WORKBENCH_MIN)
  })

  it('step 2: details shrinks first, center pinned at min, workbench untouched', () => {
    // 280 + 560 + 360 + 640 = 1840 > 1800; details concedes to 1800-280-560-640 = 320.
    const cols = computeColumns(1800, open(SIDEBAR_DEFAULT), open(WORKBENCH_DEFAULT), open(DETAILS_DEFAULT))
    expect(cols).toEqual({ sidebar: 280, center: CENTER_MIN, workbench: 560, details: 320 })
  })

  it('boundary: exactly at the step-1/step-2 seam', () => {
    const fits = 300 + 360 + CENTER_MIN
    expect(computeColumns(fits, open(300), closed(560), open(360)))
      .toEqual({ sidebar: 300, center: CENTER_MIN, workbench: 0, details: 360 })
    expect(computeColumns(fits - 1, open(300), closed(560), open(360)))
      .toEqual({ sidebar: 300, center: CENTER_MIN, workbench: 0, details: 359 })
  })

  it('step 3: details auto-closes before the workbench concedes', () => {
    // 280 + 560 + 640 = 1480 <= 1500 < 1480 + DETAILS_MIN: details 0, workbench holds.
    const cols = computeColumns(1500, open(SIDEBAR_DEFAULT), open(WORKBENCH_DEFAULT), open(DETAILS_DEFAULT))
    expect(cols).toEqual({ sidebar: 280, center: CENTER_MIN, workbench: 560, details: 0 })
  })

  it('step 4: the workbench shrinks toward its minimum once details is gone', () => {
    // 280 + 320 + 640 = 1240 <= 1300 < 280 + 560 + 640: workbench concedes to 1300-280-640 = 380.
    const cols = computeColumns(1300, open(SIDEBAR_DEFAULT), open(WORKBENCH_DEFAULT), open(DETAILS_DEFAULT))
    expect(cols).toEqual({ sidebar: 280, center: CENTER_MIN, workbench: 380, details: 0 })
  })

  it('boundary: exactly at the step-4/step-5 seam', () => {
    const seam = SIDEBAR_DEFAULT + WORKBENCH_MIN + CENTER_MIN
    expect(computeColumns(seam, open(SIDEBAR_DEFAULT), open(WORKBENCH_DEFAULT), open(DETAILS_DEFAULT)))
      .toEqual({ sidebar: 280, center: CENTER_MIN, workbench: WORKBENCH_MIN, details: 0 })
    expect(computeColumns(seam - 1, open(SIDEBAR_DEFAULT), open(WORKBENCH_DEFAULT), open(DETAILS_DEFAULT)))
      .toEqual({ sidebar: 280, center: seam - 1 - SIDEBAR_DEFAULT, workbench: 0, details: 0 })
  })

  it('the sidebar never concedes: center absorbs the deficit below CENTER_MIN', () => {
    // 700 < 280+560+640 and below every concession floor: sidebar keeps 280.
    const cols = computeColumns(700, open(SIDEBAR_DEFAULT), open(WORKBENCH_DEFAULT), closed(DETAILS_DEFAULT))
    expect(cols).toEqual({ sidebar: SIDEBAR_DEFAULT, center: 420, workbench: 0, details: 0 })
  })

  it('sidebar-closed narrow window: the workbench concedes then auto-closes', () => {
    const seam = SIDEBAR_COLLAPSED + WORKBENCH_MIN + CENTER_MIN
    expect(computeColumns(seam, closed(300), open(WORKBENCH_DEFAULT), closed(DETAILS_DEFAULT)))
      .toEqual({ sidebar: SIDEBAR_COLLAPSED, center: CENTER_MIN, workbench: WORKBENCH_MIN, details: 0 })
    expect(computeColumns(seam - 1, closed(300), open(WORKBENCH_DEFAULT), closed(DETAILS_DEFAULT)))
      .toEqual({ sidebar: SIDEBAR_COLLAPSED, center: seam - 1 - SIDEBAR_COLLAPSED, workbench: 0, details: 0 })
  })

  it('tiny viewport: every optional column closes, sidebar holds, center takes the remainder', () => {
    const cols = computeColumns(400, open(SIDEBAR_DEFAULT), open(WORKBENCH_DEFAULT), open(DETAILS_DEFAULT))
    expect(cols.workbench).toBe(0)
    expect(cols.details).toBe(0)
    expect(cols.sidebar).toBe(SIDEBAR_DEFAULT)
    expect(cols.center).toBe(Math.max(0, 400 - SIDEBAR_DEFAULT))
  })

  it('recovery is pure: re-widening restores preferred widths untouched', () => {
    const squeezed = computeColumns(1300, open(SIDEBAR_DEFAULT), open(WORKBENCH_DEFAULT), open(DETAILS_DEFAULT))
    expect(squeezed.workbench).toBe(380)
    expect(squeezed.details).toBe(0)
    const restored = computeColumns(1920, open(SIDEBAR_DEFAULT), open(WORKBENCH_DEFAULT), open(DETAILS_DEFAULT))
    expect(restored.workbench).toBe(WORKBENCH_DEFAULT)
    expect(restored.details).toBe(DETAILS_DEFAULT)
    expect(restored.sidebar).toBe(SIDEBAR_DEFAULT)
  })
})

describe('computeColumns — degenerate viewports', () => {
  it('sidebar closed and viewport below CENTER_MIN: optional columns auto-close, center takes the rest', () => {
    // Reaches step 5's auto-close with the compact rail sidebar.
    expect(computeColumns(500, closed(300), open(WORKBENCH_DEFAULT), open(DETAILS_DEFAULT)))
      .toEqual({ sidebar: SIDEBAR_COLLAPSED, center: 500 - SIDEBAR_COLLAPSED, workbench: 0, details: 0 })
  })
})
