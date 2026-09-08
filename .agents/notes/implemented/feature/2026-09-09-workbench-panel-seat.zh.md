# Agent Note：工作台面板是 slot 条目，而不是注册表记录

Status: implemented

[English](2026-09-09-workbench-panel-seat.md) | 中文

## 问题

`workbench` 栏（见[栏位 note](2026-09-09-workbench-column-slot.md)）给了工作台一个座位，但还没有定义面板如何进入其中。社区工作台有两种做法，都不适合这套客户端栈：`dsh-better-sidebar` 发布 `ctx.betterSidebar.registerTab(descriptor)`，而该描述符携带一个 React 组件（`repos/DSH-better-sidebar/src/client/service.ts:1-22`）；其他插件则把自己的面板硬编码在各自的 bundle 里。客户端规则禁止第一种形态——「UI 域之间只共享 JSON 兼容的数据与回调……ReactNode 内容走 slot；不要新增 ReactNode 值的 owner props 或 injected 成员」（`packages/client/AGENTS.md`）——而第二种让面板无法被组合。

## 决策

**一个工作台面板就是一个 `workbench.panel` slot 条目；不存在并行的面板注册表。** 外壳占用该栏并把 `workbench.panel` 声明为 `keyed`／`root` 座位，因此面板通过唯一那个组合 API 注册：

面板通过 `ctx.slots.inject('workbench.panel', ...)` 回调里的 `ctx.slots.register({ name: 'workbench.panel', id: '<面板 id>', order, label }, Component)` 注册，因此该贡献会等待声明出现，并随注册方的 fiber 一起离开。

因此面板成员关系就在 slot 账本里：注册与销毁跟随注册方的 fiber，重复 key 在加载时报错，外壳从不需要枚举插件。

**外壳把账本投影成标签列表，并且只持有选择。** `ctx.slots.entries('workbench.panel')` 加 `ctx.slots.subscribe` 驱动一个 `SnapshotStore<readonly WorkbenchPanelTab[]>`，通过注册项的 inject `hooks` 隔间暴露，渲染器把它绑定为 `usePanels`；被选中的 id 存在外壳 entry 声明的 store（`createWorkbenchStore`）里。Keyed 派发（`renderSlot('workbench.panel', { width }, { entryKey: active })`）只挂载被选中的面板，未注册的选择回退到第一个标签。

**`ctx.workbench` 只承载切换动作。** `open(panelId?)` 写入选择并打开该栏，`close()` 与 `toggle()` 委托给 `ctx.layout`；控制器通过注册项的 inject 钩子接线，与 `ctx.layout` 相同的装配模式。内置入口是 `conversation.session.header.utilities` 里的一个 list 条目（id `workbench-toggle`，order `-10`），它不携带实时栏状态；它排在会话自身工具之前，从而让会话日志导出继续占据头部几何契约钉住的右边缘。

**收起的栏不渲染任何内容。** 外壳在 `collapsed` 时返回 null，因此工作台不会进入用户尚未打开它的页面的无障碍树。组件保持挂载，所以其 entry store 的选择在关闭与重新打开之间存活；面板组件则像切换标签一样卸载。

## 考虑过的替代方案

- **`ctx.workbench.registerPanel({ id, component })` 服务。** 社区工作台用的形态，也是插件作者会预期的形态。已否决：它把 React 组件放进服务面，违反客户端数据规则，并且会重复账本已经拥有的生命周期（重复检测、销毁、重载安全）。
- **用 list slot 渲染所有面板，用 CSS 隐藏非活动项。** 派发更简单，但每个面板的副作用与订阅在隐藏时照样运行，而外壳仍需要单独的标签列表。
- **带静态 `keyProps` 表的 keyed 派发。** 能在派发点得到每个面板 id 的类型，但该表是声明期的，而面板在运行时注册，因此动态面板无法被它类型化。
- **把面板塞进 `details`。** 已在栏位 note 中否决：该栏是工具外壳，上限 520px 且是会话作用域。

## 后果

一个面板就是一次注册调用加一个组件，其余——排序、标签、选择、销毁——都是 entry 轴上的框架语义。代价是面板无法脱离 slot 注册来贡献，因此非 UI 的产出方（host 服务、命令）必须经由客户端插件；这与这里其他每个 UI 表面所受的约束相同。标签投影只是一个小镜像，唯一职责是把账本条目变成 `{ id, label, order }` 行；对于没有 `key` 的注册项它会丢弃，而不是编造一个 id。

## 测试

`packages/client/ui-workbench/tests/browser-plugin.client.spec.ts` 在真实 `SlotRegistry` 之上启动浏览器半边：栏位占用者与已声明的座位、头部开关、字典注册与 fiber 销毁时的撤回、实时标签投影（排序与后续注册）、控制器的先选择再打开语义，以及未接线时的报错。`tests/workbench-shell.client.spec.tsx` 覆盖空状态、首面板与被选面板的派发、点击标签写入选择、单面板时标签条折叠，以及未注册选择的回退。`pnpm run gen-client-catalog` 重新生成面向 agent 的 slot 目录（含新座位），`test:gui` 与 `DSH_SNAPSHOT=replay` 的 web 通道覆盖组装后的浏览器。
