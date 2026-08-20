# dsh-archived-sessions

[English](README.md) | 中文

归档会话管理（Archived sessions manager）—— DeepSeek Harness Web 界面的设置页扩展，以单 bundle 包分发，一条命令即可安装。

在 Harness 的「设置 → 归档会话」页面中提供：

- 查看所有已归档会话（标题、创建时间、所属目录、磁盘上的实际文件路径）
- 每个会话占用的磁盘空间与总占用
- 释放（取消归档，回到原工作区）—— 单个、批量、一键全部
- 从硬盘删除会话文件 —— 单个、批量、一键清空（两步确认）
- 点击会话标题展开查看最近 100 条用户 / 助手 / 工具消息；长会话通过 rc.7 的有界日志切片读取，不展开完整事件数组

> ⚠️ **安全提示**：本插件包含「从硬盘删除会话文件」能力，删除不可恢复。安装即代表信任本仓库代码会在你的机器上以你的权限运行，请自行审阅源码。

## 安装（推荐：suite 安装器）

在 suite 根目录中同时安装归档会话 bundle 和全部 7 个预设：

```sh
pnpm run community:install -- --dsh-home /path/to/.dsh
```

安装器只将本 bundle 添加到 `web` profile，以可恢复备份安装自有预设，并且绝不访问 sessions 目录。安装后重启 Harness；设置面板底部会出现「归档会话」页面。

> 本纯 JS 包没有 `prepare` 构建脚本，因此**不需要** pnpm `allowBuilds` 授权。

### 底层本地安装（仅限开发）

```sh
dsh plugin --profile web add ./community/bundles/archived-sessions
```

仅在开发 bundle 时从 suite 根目录运行此命令。它绕过 suite 预设安装、所有权标记和备份；不会改变 bundle 的安全边界。

## 仓库结构

```
dsh-archived-sessions/
├── package.json          # dsh.bundle + dsh.client declarations (one package, two ends)
├── cordis.patch.yml      # inserts one archived-sessions row (Host + browser)
├── lib/
│   ├── index.js          # Host plugin: webServer /dsh-archived/* routes + all business logic
│   └── client.js         # browser plugin: settings-page UI (__ModuleLoader__ bundle)
├── README.md
└── LICENSE               # MIT
```

宿主端 API（`POST /dsh-archived/*`，无鉴权、同源）：

| 路由 | 请求体 | 返回 |
| --- | --- | --- |
| `/dsh-archived/list` | `{}` | `{ items, totalBytes }` |
| `/dsh-archived/unarchive` | `{ sessionId }` | `{ ok, changed, archivedSessionIds }` |
| `/dsh-archived/delete` | `{ sessionId }` | `{ ok, deleted, sessionId, path?, sizeBytes?, reason? }` |
| `/dsh-archived/detail` | `{ sessionId }` | `{ id, createdAt, cwd, totalEvents, messageCount, truncated, messages }` |

## 兼容性

- 目标 Harness 版本：`0.1.0-rc.7`（web profile 组合结构和有界 `SessionLogCut` 读取）。
- 宿主端插件无第三方运行时依赖（纯 ESM，不 import 任何 `@deepseek-ai/*`，需要的能力全部从 `ctx` 获取）；浏览器端仅依赖 `react`（由 Harness 前端运行时提供，属于 platform seed）。

## License

MIT
