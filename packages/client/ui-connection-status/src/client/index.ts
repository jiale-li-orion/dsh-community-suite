/**
 * Connection status plugin, browser half: one `shell.overlay` entry that reports
 * a dead connection. The runtime drops generation-scoped interaction state when
 * a generation dies and rebuilds it after reconnect without saying anything, so
 * without this banner a dropped connection is indistinguishable from an
 * application that stopped responding.
 *
 * The banner holds no state of its own: it subscribes to the phase the
 * connection plugin publishes, and every gesture that could act on a stale
 * connection stays owned by its own plugin.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { ConnectionBanner } from './ConnectionBanner.tsx'
import { en, NS, zh, type ConnectionStatusKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Connection banner copy. */
    'connection': ConnectionStatusKey
  }
}

export type { ConnectionBannerProps } from './ConnectionBanner.tsx'

/** Required services for the dictionaries, the overlay seat, and the phase source. */
export const inject = ['connection', 'slots', 'locale']

/**
 * Client plugin body: register the dictionaries and the overlay banner.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  // The connection service declares no `ctx.<name>` augmentation, so the handle
  // is read through the service store (the optional-service rule).
  const connection = ctx.get('connection') as ConnectionHandle
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-connection-status: dictionaries')
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'connection-status',
    locale: NS,
    inject: () => ({ hooks: { connectionState: connection.connectionState } }),
  }, ConnectionBanner))
}
