# Agent Note：插件市场面板是同一份安装能力的第二个、由人发起的调用方

Status: implemented

[English](2026-09-09-plugin-marketplace-panel.md) | 中文

## 问题

ADR-7 刻意把插件目录做成**只有工具**——「索引是数据，所以暴露成 tool/service，不要 UI」——因为被审计的 `dsh-plugins-store` 是靠绕过 rc.7 `/api` 信任栅栏的精确路径路由来完成安装的。这个判断针对**路由**是对的，但它让「用户想自己浏览并安装插件、不想让 agent 在环里」的部署没有任何可见入口：唯一的手段是去问模型。那个被审计项目的 UI 恰好展示了缺失的形态（搜索框、结果行、每行一个安装动作），而它的缺陷在按钮背后的传输，不在按钮本身。

## 决策

**先把安装抽成一份能力，再让两个平面调用它。** `@deepseek-ai/dsh-plugin-install` 发布 `ctx.pluginInstall.install(url)`：解析 URL 指向的目录条目，用 `parseInstallTarget` 校验该条目自带的目标，从本次构建的模块路径推导 profile，并以 argv 数组执行 `dsh plugin --profile <profile> add <target>`。`@deepseek-ai/dsh-tool-plugin-catalog` 的 `plugin_install` 现在只负责解析条目、请求 `ctx.approval`，然后调用该能力；新的 `marketplace` 面板在两步确认后调用同一份能力。校验器、profile 推导与进程路径都只有一份，两个调用方不可能漂移。

**目录获得 Remote 面；索引仍然只有一个读取者。** `AwesomePluginCatalog` 改为直接继承 `TypertRemoteService` 并给 `search`/`get` 标上 `@Remote`，于是浏览器经 host 缓存搜索，而不是自己去抓 3 MB 索引。`@deepseek-ai/dsh-plugin-catalog` 保持与传输无关的契约（条目与分页词表、带 code 的错误、Context 键）。

**人的手势就是同意；agent 路径保留 `ctx.approval`。** 面板安装是操作者在自己的浏览器里点「安装」再点「确认安装」，因此不需要让他批准自己。`/api` 浏览器信任栅栏依旧限定谁能到达该端点——与工具路径依赖的是同一道栅栏——这正是被否掉的社区路由所缺少的。

**面板从不接触命令。** 它收到条目元数据、回传一个 URL；条目的安装字符串留在 host 侧，由校验器决定它的目标能否运行。

## 考虑过的替代方案

- **保持目录只有工具。** 否决：用户要的就是看得见的市场，而「让模型去装」不是市场。ADR-7 反对的是无栅栏的路由，本设计没有把它引回来。
- **直接挂载被审计的市场 UI。** 否决：它是为另一个 DSH 版本写的，且其安装路径正是 ADR-7 记录的那个缺陷。
- **让面板自己经 `webServer` 路由安装。** 否决：那又回到了定制路由的形态，还会复制校验器与 profile 推导。
- **把目录的安装命令发给客户端再 POST 回来。** 否决：命令字符串过线正是工具路径拒绝的事；客户端只发 URL。
- **给面板单独做一个审批提示。** 否决：让人类批准自己刚按下的按钮是噪声，不是控制。

## 后果

部署现在有两个入口通向同一份安装能力：agent 的工具（经审批）与市场面板（人的手势），两者校验同一个目标、都提示需要重启。目录 provider 多了一个 wire 面，所以它的缓存现在也服务浏览器。代价是多了一条 host 行（`plugin-install`）和一个需要持续覆盖率的客户端面板；面板仍然不能卸载，这一点继续有意推迟。

## 测试

`packages/workbench/plugin-install/tests/plugin-install.spec.ts` 用记录式进程通道驱动该能力：argv 形态、配置的 profile、signal 透传、未知 URL、失败退出码、静默失败、没有采集流、缺少 CLI 入口，以及目标校验矩阵与 profile 推导。`packages/workbench/tool-plugin-catalog/tests/tool-plugin-catalog.spec.ts` 用真实工具注册表与审批服务驱动两个工具（目录与安装能力为记录式实现）。`packages/client/ui-workbench/tests/marketplace-panel.client.spec.tsx` 覆盖搜索、结果行、两步确认、空态与失败态，以及两种非 Error 拒绝；`tests/browser-plugin.client.spec.ts` 覆盖面板注册与两个 Remote 面（含失败的 Remote）。`pnpm run test:gui` 与 `DSH_SNAPSHOT=replay` 的 web 车道覆盖组装后的浏览器。
