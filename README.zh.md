# DeepSeek Harness Community Suite

[English](README.md) | 中文

DSH Community Suite 是基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的社区维护发行版。本仓库以官方 `dsh-v0.1.0-rc.7` 为基础，将会话上下文增强、归档会话 Web bundle 和 7 个锚定 agent 预设整理在同一个仓库中。

DeepSeek Harness（`dsh`）采用**一切皆插件**的架构，并由 [Cordis](https://github.com/cordiverse/cordis) 驱动，其设计参见论文 [_A Programming Paradigm for Spatiotemporal Composability_](https://github.com/cordiverse/paper)。

本仓库不是 DeepSeek AI 官方发行版。上游的精确版本、许可证与适配补丁记录在[社区源码记录](COMMUNITY_SOURCES.md)中。

## 状态

本套件固定采用官方 `dsh-v0.1.0-rc.7` 基线，并保留仓库的 `pnpm@11.22.0` 工具链选择。DeepSeek Harness 仍处于开发者预览阶段，可能出现破坏兼容性的变更；此快照中的社区模块仅支持已记录的基线。

## 近期更新

- **2026-09-09 — 工具结果的图片进入模型上下文。** 工具结果里的图片现在跟随其 `role: tool` 消息、由一条 user 消息承载，因此 `read_image` 的输出以及任何含有它的历史在原生路由上都能继续使用。见[工具结果图片 note](.agents/notes/implemented/feature/2026-09-09-llm-deepseek-tool-result-images.md)。
- **2026-09-08 — 按模型声明输入模态。** `llm-deepseek` 的每个 catalog 配置项自行声明 `inputModalities`；省略表示 `[text]`，只有声明了 `image` 的配置项才会把用户图片送到协议上。见[输入模态 note](.agents/notes/implemented/feature/2026-09-08-llm-deepseek-catalog-input-modalities.md)。
- **2026-09-08 — 运行说明重构**为「环境要求 / 首次启动 / 后续启动与更新」三节。

## 已整合的优化

- **会话上下文与压缩**：有界长会话读取、packed retention、上下文检查与区间选择、历史召回、按模型容量规划压缩，以及可恢复的摘要审阅；来源为 [leavelet/deepseek-harness](https://github.com/leavelet/deepseek-harness)。
- **归档会话**：在 Web 设置页列出、预览、释放、删除归档会话并统计容量的 bundle；来源为 [MuWinds/dsh-archived-sessions](https://github.com/MuWinds/dsh-archived-sessions)。
- **锚定 agent**：7 个可独立安装的 agent 组合，提供受控的首轮工具面、上下文门控、wire-think 路由、压缩感知的阶段提升、默认会话 prefab 播种、跨平台 shell 路径与稳健的指令发现；来源为 [xiaobright/dsh-anchored-standard](https://github.com/xiaobright/dsh-anchored-standard)。
- **DeepSeek 图片输入**：内置的 `llm-deepseek` 适配器按模型声明输入模态，并把用户上传的图片与工具产生的图片都以 `image_url` data URL 送到模型。
- **Human-Agent 共享工作台**：一个可停靠的栏位，面板与文件查看器都经声明的槽位注册（`workbench.panel`、`workbench.viewer`）；浏览器与 agent 修改同一份 host 持有的视图（`ctx.workbench` 加转发的 `workbench/changed` 事件）；一条受围栏保护的字节路由以 `Range`／`206`／`416` 流式提供工作区文件。全部为 rc.7 seam 上的一手包；设计参考 [omdsh-dev/DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar)（面板与文件查看器注册表）、[kendu76/dsh-music-player](https://github.com/kendu76/dsh-music-player)（host 持有、两个平面共同修改的意图）、[tsonglew/dsh-media-preview](https://github.com/tsonglew/dsh-media-preview)（Range／流式处理器）。未搬运任何社区代码。
- **插件目录**：一个 `marketplace` 工作台面板，加上 `plugin_search` 与 `plugin_install` 两个工具，都建立在 CC0 的 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 索引之上。两条路径共用一份安装能力：面板里确认过的点击就是人的手势，工具则额外走 `ctx.approval`；无论哪条，条目自带的目标都要先校验、再以 argv 数组执行。安装目标校验与「搜索/安装」拆分参考 [DshMarketPlace/dsh-plugins-store](https://github.com/DshMarketPlace/dsh-plugins-store)；索引在运行时作为数据消费，绝不重新生成或镜像。

已审计但有意未落地的部分：agent 自写工作台扩展（设计参考 [saya-ch/dsh-mobile](https://github.com/saya-ch/dsh-mobile)）与 Android／桌面客户端（[ZSeven-W/dsh-android](https://github.com/ZSeven-W/dsh-android)、[ZgblKylin/dsh-gui](https://github.com/ZgblKylin/dsh-gui)，以及仅允许设计研究的 AGPL-3.0／GPL-3.0 项目）。相关决策与每条已落地行的回滚方式记录在工作台 [Agent Notes](.agents/notes/implemented/feature/2026-09-09-workbench-shared-view.md)。

完整功能审计与兼容边界见[社区优化](docs/community-optimizations.md)（[中文](docs/community-optimizations.zh.md)）；精确的上游修订与许可证见[社区来源记录](COMMUNITY_SOURCES.md)。

## 运行

### 环境要求

安装 Node.js `^22.19.0` 或 `>=24.0.0`，并安装 pnpm 11.22：

```sh
npm install --global pnpm@11.22.0
```

### 首次启动

克隆仓库、安装依赖、运行不使用真实 API 的社区检查，并构建 Harness：

```sh
git clone https://github.com/jiale-li-orion/dsh-community-suite.git
cd dsh-community-suite
pnpm install --frozen-lockfile
pnpm run community:check
pnpm run build
```

选择 DSH home，安装社区模块并启动 Web UI：

```sh
export DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
pnpm run community:install -- --dsh-home "$DSH_HOME"
pnpm dsh web
```

安装器只把归档会话 bundle 添加到 `web` profile，并在 `.agent-presets` 下安装以下 preset id：`anchored-standard`、`prefab-anchored-standard`、`combo-anchored-standard`、`eternal-minimal`、`whoami-standard`、`wire-think-standard` 与 `zero-anchored-standard`。安装器会拒绝覆盖不属于本套件的目标，在使用 `--update` 更新自有安装项前创建备份，并且不会访问会话目录。

Web UI 默认地址为 `http://127.0.0.1:3080`。使用 DSH 时请保持该终端运行。

### 后续启动与更新

使用同一个 DSH home 再次启动已经安装的 checkout：

```sh
cd dsh-community-suite
export DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
pnpm dsh web
```

拉取套件更新后，刷新依赖、重新构建，并且只更新属于本套件的安装项：

```sh
git pull --ff-only
pnpm install --frozen-lockfile
pnpm run community:check
pnpm run build
pnpm run community:install -- --dsh-home "$DSH_HOME" --update
```

profile 与界面说明详见 [Web UI 指南](docs/user/guide/index.md)（[中文](docs/user/guide/index.zh.md)）。

### 官方 npm 发行版

如需运行不包含本套件社区模块的官方 npm 发行版：

```sh
npx @deepseek-ai/dsh web
```

## 仓库布局

```text
community/
├── bundles/archived-sessions/
├── presets/anchored-standard/
├── patches/
└── install.mjs
packages/
docs/community-optimizations.md
COMMUNITY_SOURCES.md
```

## 社区与支持

- 本套件的整合问题请提交到当前仓库的 [issue tracker](https://github.com/jiale-li-orion/dsh-community-suite/issues)。
- Harness 上游问题请通过官方 [DeepSeek Harness Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions)反馈。
- 为插件仓库添加 [`dsh-plugin`](https://github.com/topics/dsh-plugin) 话题，便于被发现。

## 参与贡献

参见 [CONTRIBUTING.md](CONTRIBUTING.md)。开始开发前请阅读[开发指南](docs/development.md)（[中文](docs/development.zh.md)）、[架构文档](docs/architecture.md)（[中文](docs/architecture.zh.md)）与 [AGENTS.md](AGENTS.md)。

## 许可证

[MIT](LICENSE)

第三方源码版本与许可证记录在[社区源码记录](COMMUNITY_SOURCES.md)和 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)中。每个导入的社区模块继续保留各自的许可证与声明。
