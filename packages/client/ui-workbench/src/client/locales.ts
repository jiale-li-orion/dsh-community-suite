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
  'files.title': '文件',
  'files.parent': '返回上级',
  'files.empty': '这个目录是空的。',
  'files.error': '读取目录失败：{message}',
  'files.root': '工作区根目录',
  'viewer.close': '关闭预览',
  'viewer.unsupported': '这个文件没有可用的预览。',
  'viewer.media': '{name} 预览',
  'marketplace.title': '插件市场',
  'marketplace.search': '搜索',
  'marketplace.placeholder': '按能力搜索插件…',
  'marketplace.notice': '收录不等于安全审查：安装会以本部署的权限运行第三方代码。',
  'marketplace.empty': '没有匹配的插件。',
  'marketplace.error': '目录读取失败：{message}',
  'marketplace.install': '安装',
  'marketplace.confirm': '确认安装',
  'marketplace.installed': '已安装 {name} 到 profile "{profile}"，重启后生效。',
  'wallpaper.title': '壁纸',
  'wallpaper.current': '当前壁纸',
  'wallpaper.none': '未设置',
  'wallpaper.clear': '清除',
  'wallpaper.set': '设为壁纸',
  'wallpaper.root': '工作区根目录',
  'wallpaper.parent': '返回上级',
  'wallpaper.empty': '这个目录里没有图片。',
  'wallpaper.error': '读取工作区失败：{message}',
  'wallpaper.noSession': '先打开一个会话再选壁纸。',
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
  'files.title': 'Files',
  'files.parent': 'Go up',
  'files.empty': 'This directory is empty.',
  'files.error': 'Could not read the directory: {message}',
  'files.root': 'Workspace root',
  'viewer.close': 'Close preview',
  'viewer.unsupported': 'No preview is available for this file.',
  'viewer.media': 'Preview of {name}',
  'marketplace.title': 'Plugin marketplace',
  'marketplace.search': 'Search',
  'marketplace.placeholder': 'Search plugins by capability…',
  'marketplace.notice': 'Listing is not a security review: installing runs third-party code with this deployment\'s permissions.',
  'marketplace.empty': 'No matching plugins.',
  'marketplace.error': 'Could not read the catalog: {message}',
  'marketplace.install': 'Install',
  'marketplace.confirm': 'Confirm install',
  'marketplace.installed': 'Installed {name} into profile "{profile}"; restart to load it.',
  'wallpaper.title': 'Wallpaper',
  'wallpaper.current': 'Current wallpaper',
  'wallpaper.none': 'None',
  'wallpaper.clear': 'Clear',
  'wallpaper.set': 'Set as wallpaper',
  'wallpaper.root': 'Workspace root',
  'wallpaper.parent': 'Go up',
  'wallpaper.empty': 'No images in this directory.',
  'wallpaper.error': 'Could not read the workspace: {message}',
  'wallpaper.noSession': 'Open a session before choosing a wallpaper.',
}
