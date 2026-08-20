# DSH Community Suite 仓库设计

[English](2026-08-19-dsh-community-suite-design.md) | 中文

## 目的

`dsh-community-suite` 从一个仓库分发本地适配的 DeepSeek Harness rc.7 核心、归档会话 bundle 与 anchored-standard agent preset。仓库从已验证的集成快照开始保留一段简洁历史，而不是导入三个源仓库的历史。

GitHub 仓库默认私有。它的 `main` 分支是本地支持的发布线。迁移中的任何命令都不读取真实的 DeepSeek API key，也不写入既有会话数据。

## 仓库布局

DeepSeek Harness 源码树仍处于仓库根目录，因此已文档化的源码命令无需包装目录即可继续运行。

```text
dsh-community-suite/
├── apps/
├── packages/
│   └── ...
├── community/
│   ├── bundles/
│   │   └── archived-sessions/
│   ├── presets/
│   │   └── anchored-standard/
│   │       ├── preset/
│   │       ├── prefab/
│   │       ├── combo-anchored/
│   │       ├── eternal-minimal/
│   │       ├── whoami-standard/
│   │       ├── wire-think-standard/
│   │       └── zero-anchored-standard/
│   └── install.mjs
├── docs/
│   └── community-optimizations.zh.md
├── package.json
└── pnpm-workspace.yaml
```

归档会话实现仍是 `community/bundles/` 下可安装的树外 bundle。其包 manifest 声明 `dsh.bundle`，并将 Host 与 Client 的生命周期所有权保留在包内。这遵循官方对 `packages/bundle/` 下随 DSH 发布的 bundle 与通过 `dsh plugin add` 安装到 profile 的社区 bundle 所作的区分。

七种锚定模式仍是用户编写的 agent preset 目录。它们位于 `packages/` 之外，因为它们是运行时组合而不是 npm workspace。用于构建或验证 preset 的共享源码仍位于 `community/presets/anchored-standard/shared`，每个可安装目录则保持自包含。

## 来源所有权

核心快照来自基于 `deepseek-ai/deepseek-harness@99f6f02fec` 的干净 `integration/rc7-three-repos` worktree。它包含 pnpm 11.22 的选型、适配到 rc.7 的七个 leavelet 功能提交，以及本地集成修复。

归档会话快照来自 `MuWinds/dsh-archived-sessions@7d3ba012d3ed`，外加本地提交 `a4bdb236d94411819bc4e9bbd2fcd1cf0b7198a0`。anchored-standard 快照来自 `xiaobright/dsh-anchored-standard@25f21aefaf8d`，外加本地提交 `e6b41438ca55f2e04e8a225e4e2da3e59bc1c068`。

`COMMUNITY_SOURCES.md` 记录这些来源、固定修订、许可证和本地适配边界。官方生成的 `THIRD_PARTY_NOTICES.md` 仍由生成器拥有。导入的仓库元数据、嵌套 `.git` 目录、已安装依赖、生成缓存、用户 profile、凭据和会话数据均被排除。

## Workspace 与安装

社区 bundle 与 preset 集合留在官方 pnpm workspace 构建图之外。根包脚本提供聚焦的社区检查和无需凭据的安装器，不改变官方构建入口。

`community/install.mjs` 接受显式 `--dsh-home`；否则依次使用非空 `DSH_HOME` 和 `homedir()/.dsh`。显式值支持 `~` 与 `~/` 展开。它仅向 `web` profile 安装归档会话 bundle，并以公开 id 将七个 preset 复制到 `.agent-presets`：`anchored-standard`、`prefab-anchored-standard`、`combo-anchored-standard`、`eternal-minimal`、`whoami-standard`、`wire-think-standard` 和 `zero-anchored-standard`。除非目标是同一源快照拥有的安装且调用者明确请求更新，它拒绝覆盖既有目标。

安装会先在目标目录之外创建可恢复备份。绝不枚举、复制、更改或删除会话目录。测试将安装器指向临时 DSH home。

## 文档

根 README 保留官方标题、简短介绍、运行说明、社区链接、贡献链接与许可证部分。简洁的 Community Modules 部分链接到 bundle、preset 集合、安装说明和中文审计参考。

`docs/community-optimizations.zh.md` 是以根 README 直接风格编写的现状参考。它描述有界且打包的会话读取、上下文管理与压缩审查、进程表批处理、归档会话操作，以及七种锚定组合。它指出每种能力由哪个仓库贡献，但不叙述合并过程。

## 验证

验证不运行 `test:e2e`、Prefab roll/probe 或可能消耗真实凭据的命令。

核心快照运行集成计划要求的相关单元测试、typecheck、lint、构建、无凭据快照、Web 测试、文档同步和卫生检查。归档会话 bundle 使用临时 JSONL fixture 运行 Host 测试，包括生命周期清理、有界详情读取、安全删除和路径拒绝。anchored-standard 集合运行 `npm run check`，并在临时 DSH home 中挂载全部七个 preset，以验证发现、组合和首轮工具注册。

发布前，仓库不得跟踪生成残留、嵌套仓库元数据、凭据、用户主目录路径或会话产物。最终提交推送到私有 GitHub 仓库 `dsh-community-suite`，以 `main` 为默认分支。
