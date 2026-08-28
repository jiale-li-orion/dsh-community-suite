# DeepSeek Harness Community Suite

[English](README.md) | 中文

DSH Community Suite 是基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的社区维护发行版。本仓库以官方 `dsh-v0.1.0-rc.7` 为基础，将会话上下文增强、归档会话 Web bundle 和 7 个锚定 agent 预设整理在同一个仓库中。

DeepSeek Harness（`dsh`）采用**一切皆插件**的架构，并由 [Cordis](https://github.com/cordiverse/cordis) 驱动，其设计参见论文 [_A Programming Paradigm for Spatiotemporal Composability_](https://github.com/cordiverse/paper)。

本仓库不是 DeepSeek AI 官方发行版。上游的精确版本、许可证与适配补丁记录在[社区源码记录](COMMUNITY_SOURCES.md)中。

## 状态

本套件固定采用官方 `dsh-v0.1.0-rc.7` 基线，并保留仓库的 `pnpm@11.22.0` 工具链选择。DeepSeek Harness 仍处于开发者预览阶段，可能出现破坏兼容性的变更；此快照中的社区模块仅支持已记录的基线。

## 已整合的优化

- **会话上下文与压缩**：有界长会话读取、packed retention、上下文检查与区间选择、历史召回、按模型容量规划压缩，以及可恢复的摘要审阅；来源为 [leavelet/deepseek-harness](https://github.com/leavelet/deepseek-harness)。
- **归档会话**：在 Web 设置页列出、预览、释放、删除归档会话并统计容量的 bundle；来源为 [MuWinds/dsh-archived-sessions](https://github.com/MuWinds/dsh-archived-sessions)。
- **锚定 agent**：7 个可独立安装的 agent 组合，提供受控的首轮工具面、上下文门控、wire-think 路由、压缩感知的阶段提升、默认会话 prefab 播种、跨平台 shell 路径与稳健的指令发现；来源为 [xiaobright/dsh-anchored-standard](https://github.com/xiaobright/dsh-anchored-standard)。

完整功能审计与兼容边界见[社区优化](docs/community-optimizations.md)（[中文](docs/community-optimizations.zh.md)）。

## 运行

### 从源码运行

安装 Node.js，克隆本仓库并构建 Harness：

```sh
git clone https://github.com/jiale-li-orion/dsh-community-suite.git
cd dsh-community-suite
pnpm install --frozen-lockfile
pnpm run build
```

先运行不使用真实 API 的社区检查，再将 bundle 和预设安装到指定 DSH home：

```sh
pnpm run community:check
pnpm run community:install -- --dsh-home /path/to/.dsh
```

安装器只把归档会话 bundle 添加到 `web` profile，并在 `.agent-presets` 下安装以下 preset id：`anchored-standard`、`prefab-anchored-standard`、`combo-anchored-standard`、`eternal-minimal`、`whoami-standard`、`wire-think-standard` 与 `zero-anchored-standard`。安装器会拒绝覆盖不属于本套件的目标，在使用 `--update` 更新自有安装项前创建备份，并且不会访问会话目录。

使用同一个 DSH home 启动 Web UI：

```sh
DSH_HOME=/path/to/.dsh pnpm dsh web
```

Web UI 默认地址为 `http://127.0.0.1:3080`。详见 [Web UI 指南](docs/user/guide/index.md)（[中文](docs/user/guide/index.zh.md)）。

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
