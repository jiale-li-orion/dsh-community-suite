/**
 * Shell-overlay connection banner. It renders nothing while the connection is
 * healthy, so the overlay layer stays empty on the normal path; the connection
 * plugin's published phase is the only data it reads.
 */
import type { ConnectionStateSource } from '@deepseek-ai/dsh-client-connection/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { NS } from './locales.ts'
import css from './ConnectionBanner.module.css'

/** Registrant-private injected share: the published connection phase. */
export interface ConnectionBannerInjected {
  hooks: {
    /** Connection phase published by the connection plugin. */
    connectionState: ConnectionStateSource
  }
}

/** Full composed props: runtime owner share + injected phase source + locale seat. */
export type ConnectionBannerProps =
  & PropsRuntime<'shell.overlay'>
  & InjectFace<ConnectionBannerInjected>
  & PropsLocale<typeof NS>

/**
 * Render the banner while the connection is down.
 * @param props - runtime share, the injected phase source, and the locale seat.
 * @returns the status line, or nothing while the connection is healthy or
 * before the stream loop has started.
 */
export function ConnectionBanner({ useConnectionState, t }: ConnectionBannerProps) {
  const phase = useConnectionState(value => value)
  if (phase !== 'reconnecting') return null
  return (
    <div className={css.banner} role="status" aria-live="polite">
      <span className={css.dot} aria-hidden="true" />
      <span>{t('reconnecting')}</span>
    </div>
  )
}
