# Agent Note：工作台视图由 host 持有，两个平面共同修改它

Status: implemented

[English](2026-09-09-workbench-shared-view.md) | 中文

## 问题

工作台栏与它的面板座位（见[栏位 note](2026-09-09-workbench-column-slot.md)、[面板座位 note](2026-09-09-workbench-panel-seat.md)）负责组合 UI，但它们所展示的**视图**——打开/关闭、选中哪个面板——只存在于浏览器的布局 store 与选择 store 中。agent 完全无法驱动工作台，两个浏览器之间也可能各说各话。社区里最接近的功能来自 `dsh-music-player`：它用一个 host 持有的意图队列解决，工具写入、客户端每两秒轮询（`repos/dsh-music-player/lib/index.js:1522`、`:3877`）；而它自己的审计记录了代价——没有服务缝、没有事件、每个客户端永远轮询（`notes/dsh-music-player.md:70-97`）。

## 决策

**一个 host 服务持有共享视图；每次修改都提交并推送。** `@deepseek-ai/dsh-workbench` 发布 `ctx.workbench`，把 `state()`、`open(panelId | null)`、`close()`、`select(panelId)` 与 `toggle()` 标记为 `@Remote` 方法。每次提交都赋值视图、以分离副本发出 `workbench/changed`、并返回已提交的值。该事件被加入 `API_REMOTE_FORWARDED_EVENTS`，因此浏览器通过 `ctx.remote.$on` 原样收到它，无需轮询。

**agent 工具写入同一份视图并返回通知。** `@deepseek-ai/dsh-tool-workbench` 注册 `workbench_open`、`workbench_close` 与 `workbench_status`；它们调用服务、从不触碰浏览器，返回 `Workbench opened on panel "<id>".`／`Workbench closed.` 以及结构化的 `open`／`active` 字段。工具集独立成包，因为服务包默认导出类，而函数插件具名导出 `name`／`inject`／`apply`，混用两种形态会让 Loader 丢弃函数命名空间（`packages/AGENTS.md`）。

**浏览器是投影，而不是第二权威。** 客户端的 `WorkbenchController` 不持有自己的视图：手势调用 Remote，推送来的 `workbench/changed` 被投影到外壳的选择 store 与 `ctx.layout` 的栏几何上。在 shell entry 挂载之前到达的视图会排队，并在接线时应用，因此初始的 `state()` 读取不会丢失。Remote 调用失败时保留原有视图，而不是凭空造出一个状态。

**目录列举以会话工作区为围栏。** `listDir(sessionId, path)` 以会话记录的 `cwd` 为根，经 `ctx.fs` 列举；没有记录 `cwd` 的会话、以及逃出该根的任何路径，都以 `WORKBENCH_OUTSIDE_WORKSPACE` 被拒绝。因此内置文件面板读到的正是 agent 操作的那棵树，走的是同一能力，而不是自己遍历路径。

## 考虑过的替代方案

- **把视图留在浏览器，让工具发送 UI 命令。** 这是社区模式的倒置：工具会依赖浏览器的存在，无头会话或第二个客户端都无法行动，而且状态仍会在客户端之间发散。
- **轮询一条 host 路由（music-player 的形态）。** 已否决：每个手势都有延迟、每个客户端永远轮询，而且重复了转发事件白名单已经提供的传输。
- **只把视图放在客户端服务里。** 已否决：agent 工具无法触达浏览器服务，而这正是共享工作台的意义。
- **把列举围栏在进程工作目录上。** 已否决：它忽略了 agent 实际操作的按会话工作区，而社区媒体路由的整机文件系统范围正是审计标出的反例（`notes/dsh-media-preview.md:6`）。
- **把工具放进服务包。** 依 Loader 的导出形态规则否决。

## 后果

工作台现在是真正共享的：agent 可以打开或选中面板并让人看到，人的手势会更新 agent 读到的同一个值，重新加载会恢复另一个客户端提交过的视图。代价是视图是进程全局的——每个已连接的客户端与 agent 都一致，这对工作区表面是正确语义，但也意味着按客户端隔离的视图暂时无法表达。不变式伴随插件断言每个发出的载荷都等于服务持有的状态，因此分离或过期的提交会立刻报错，而不是让两个平面失步。

## 测试

`packages/workbench/workbench/tests/workbench.spec.ts` 在真实 `fs-local` 后端与一条会话记录之上启动服务：Remote 表面、每次提交发出的载荷、真实列举、相对路径解析，以及两种拒绝。`packages/workbench/tool-workbench/tests/tool-workbench.spec.ts` 通过真实工具注册表、针对一个记录型假服务驱动三个工具。`packages/client/ui-workbench/tests/browser-plugin.client.spec.ts` 覆盖投影：手势调用 Remote、推送的视图落到选择 store 与栏上、挂载前的视图排队、失败的调用不改变任何东西。`pnpm run test:gui` 与 `DSH_SNAPSHOT=replay` 的 web 通道覆盖组装后的浏览器。
