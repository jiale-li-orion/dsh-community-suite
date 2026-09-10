/**
 * Shell copy: the narrow frame's page bar.
 * @module @deepseek-ai/dsh-client-ui-layout/client/locales
 */

/** Locale namespace owned by this package. */
export const NS = 'layout'

/** Chinese dictionary (the product default); its keys are the dictionary's contract. */
export const zh = {
  'mobile.openList': '打开会话列表',
  'mobile.back': '返回会话',
  'mobile.untitled': '未命名会话',
}

/** English dictionary, key-identical to the Chinese source of truth. */
export const en: Record<LayoutKey, string> = {
  'mobile.openList': 'Open the session list',
  'mobile.back': 'Back to the conversation',
  'mobile.untitled': 'Untitled session',
}

/** Key domain of the `layout` namespace (zh is the source of truth). */
export type LayoutKey = keyof typeof zh
