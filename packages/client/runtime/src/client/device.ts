/** Client-owned device class sampling for prompt RPC provenance. */

import type { ClientDevice } from '@deepseek-ai/dsh-llm'

/**
 * Query key the phone shell loads its page with. Only our own shell can know it
 * is an app rather than a browser page, so it says so; nothing infers it.
 */
const SHELL_QUERY_KEY = 'dsh-shell'

/**
 * Classify this client from signals it owns, sampled once at load.
 *
 * The class is a property of the session's client, not of a single prompt, and
 * a value that changed mid-session would make the recorded history lie about
 * where its messages came from.
 * @returns the class this client reports, or undefined when there is no page.
 */
function detectClientDevice(): ClientDevice | undefined {
  if (typeof window === 'undefined') return undefined
  if (new URLSearchParams(window.location.search).has(SHELL_QUERY_KEY)) return 'mobile-app'
  // Coarse screen class only — the same order of information a stylesheet
  // media query sees, never a device fingerprint. Chrome exposes it directly;
  // elsewhere a coarse pointer is the closest honest equivalent.
  const chromiumMobile = (navigator as { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile
  // Not every runtime ships matchMedia (jsdom does not), so the guard is a
  // runtime check rather than an optional call the types already allow.
  const mediaQuery = window.matchMedia as ((query: string) => MediaQueryList) | undefined
  const coarse = mediaQuery === undefined ? false : mediaQuery('(pointer: coarse)').matches
  return (chromiumMobile ?? coarse) ? 'mobile-browser' : 'desktop-browser'
}

let cached: ClientDevice | undefined

/**
 * Report the class of the client making this call, sampled once per page.
 *
 * Undefined rather than a default outside a page: a runtime that cannot know
 * which client it is reports nothing, and the host records no device class for
 * that prompt instead of recording a guess.
 * @returns the device class this page reports, when it can tell.
 */
export function resolvedClientDevice(): ClientDevice | undefined {
  cached ??= detectClientDevice()
  return cached
}
