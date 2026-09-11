// @vitest-environment jsdom
/**
 * Client device class: the three buckets a prompt may declare, and the
 * deliberate silence when there is no page to classify.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { resolvedClientDevice as resolveDevice } from '../src/client/device.ts'

/**
 * Install a page whose class the sampler can read and reload the module, since
 * a class is sampled once per page.
 */
async function sampleAs(options: {
  search?: string
  userAgentMobile?: boolean
  coarsePointer?: boolean
}): Promise<ReturnType<typeof resolveDevice>> {
  window.history.replaceState({}, '', options.search === undefined ? '/' : `/${options.search}`)
  if (options.userAgentMobile === undefined) {
    Reflect.deleteProperty(navigator, 'userAgentData')
  } else {
    Object.defineProperty(navigator, 'userAgentData', {
      configurable: true,
      value: { mobile: options.userAgentMobile },
    })
  }
  // jsdom ships no matchMedia at all, so the sampler's optional call is what
  // this stands in for; the production path reads it defensively.
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({ matches: options.coarsePointer ?? false, media: query }),
  })
  vi.resetModules()
  const { resolvedClientDevice } = await import('../src/client/device.ts')
  return resolvedClientDevice()
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
  Reflect.deleteProperty(navigator, 'userAgentData')
  Reflect.deleteProperty(window, 'matchMedia')
})

describe('client device class', () => {
  it('reports the shell that says it is the app, whatever the screen reports', async () => {
    // Only our own shell can know it is an app; it says so on the URL it loads.
    expect(await sampleAs({ search: '?dsh-shell=1', userAgentMobile: false })).toBe('mobile-app')
  })

  it('reports a mobile browser from the coarse platform signal', async () => {
    expect(await sampleAs({ userAgentMobile: true })).toBe('mobile-browser')
    expect(await sampleAs({ coarsePointer: true })).toBe('mobile-browser')
  })

  it('reports a desktop browser when nothing says otherwise', async () => {
    expect(await sampleAs({ userAgentMobile: false })).toBe('desktop-browser')
  })

  it('falls back to the pointer when the platform signal is unavailable', async () => {
    expect(await sampleAs({ coarsePointer: false })).toBe('desktop-browser')
  })

  it('reports nothing when there is no page to classify', async () => {
    // The runtime ships to non-browser callers too; a class it cannot know is
    // omitted rather than invented.
    vi.resetModules()
    vi.stubGlobal('window', undefined)
    const { resolvedClientDevice: withoutPage } = await import('../src/client/device.ts')
    expect(withoutPage()).toBeUndefined()
    vi.unstubAllGlobals()
  })
})
