/**
 * Workbench copy: the column's empty state, its tab strip, and the header
 * toggle. Product copy is Chinese; the English dictionary mirrors it for the
 * `en` locale.
 * @module @deepseek-ai/dsh-client-ui-workbench/client/locales
 */

/** Locale namespace owned by this package. */
export const NS = 'workbench'

/** Chinese dictionary (the product default); its keys are the dictionary's contract. */
export const zh = {
  'title': '工作台',
  'toggle.open': '打开工作台',
  'toggle.close': '关闭工作台',
  'empty.title': '工作台还没有面板',
  'empty.hint': '安装提供工作台面板的插件后，它们会出现在这里。',
  'close': '关闭',
}

/** Workbench dictionary keys. */
export type WorkbenchKey = keyof typeof zh

/** English dictionary. */
export const en: Record<WorkbenchKey, string> = {
  'title': 'Workbench',
  'toggle.open': 'Open workbench',
  'toggle.close': 'Close workbench',
  'empty.title': 'No workbench panels yet',
  'empty.hint': 'Plugins that contribute workbench panels appear here once installed.',
  'close': 'Close',
}
