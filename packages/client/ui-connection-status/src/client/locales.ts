/** `connection` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'connection'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'reconnecting': '连接已断开，正在重连…',
} as const

/** English dictionary, key-identical to the Chinese source of truth. */
export const en: Record<ConnectionStatusKey, string> = {
  'reconnecting': 'Connection lost — reconnecting…',
}

/** Key domain of the `connection` namespace (zh is the source of truth). */
export type ConnectionStatusKey = keyof typeof zh
