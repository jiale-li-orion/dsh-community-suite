/**
 * Interface scale: how large the whole application renders on this device.
 *
 * The narrow frame is the reason this exists. A phone has a third of the width
 * of a desktop and the same UI inside it, so the interface that reads correctly
 * on a monitor is oversized in the hand — art that covers the page, controls
 * that collide, a composer that pushes the content off the screen. Text zoom
 * cannot answer that (it scales type and leaves the layout, which is what makes
 * a page look cramped); scaling the document does.
 *
 * The choice is per device, so it lives in this browser's storage rather than
 * in host settings: one person's phone and monitor hold different values.
 */

/** Steps offered by the appearance control, smallest first. */
export const UI_SCALES = [0.7, 0.8, 0.9, 1, 1.15] as const

/** Scale a narrow frame opens with; a desktop keeps the designed size. */
export const NARROW_DEFAULT_SCALE = 0.8

/** Storage key for this browser's choice. */
const STORAGE_KEY = 'dsh.ui-scale'

/**
 * Read the scale this device should render at.
 * @returns the stored scale, or the default for this frame's width.
 */
export function readUiScale(): number {
  const fallback = window.innerWidth < 1024 ? NARROW_DEFAULT_SCALE : 1
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === null) return fallback
    const value = Number.parseFloat(stored)
    return UI_SCALES.includes(value as (typeof UI_SCALES)[number]) ? value : fallback
  } catch {
    // A browser that refuses storage still renders; it just cannot remember.
    return fallback
  }
}

/**
 * Apply a scale to one element.
 * @param scale - one of {@link UI_SCALES}.
 * @param target - document element to scale.
 */
export function applyUiScale(scale: number, target: HTMLElement): void {
  target.style.setProperty('zoom', String(scale))
}

/**
 * Remember a scale for this device. Separate from applying, so booting with a
 * default does not silently write it as if the person had chosen it.
 * @param scale - one of {@link UI_SCALES}.
 */
export function rememberUiScale(scale: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(scale))
  } catch {
    // A browser that refuses storage still renders; it just cannot remember.
  }
}
