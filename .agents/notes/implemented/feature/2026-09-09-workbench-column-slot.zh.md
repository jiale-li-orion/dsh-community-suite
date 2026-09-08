# Agent Note：frame 声明一个可选的 workbench 栏

Status: implemented

[English](2026-09-09-workbench-column-slot.md) | 中文

## 问题

随附的 `AppFrame` 由三栏组成——`sidebar`、`conversation`、`details`——而这三栏都已有归属：`ui-sidebar` 占据导航栏并声明其内部座位，`ui-conversation` 占据中心栏与详情栏，而详情栏是工具检查用的外壳，约定范围只有 300–520px。因此工作台（文件树、编辑器、终端、Git、媒体）无处安放：注册进 `sidebar` 或 `details` 会替换该栏并销毁它声明的座位，而 `shell.overlay` 是点击穿透的浮层，不会让会话区重排。

社区工作台用绕过组合的方式填补这个缺口：`dsh-better-sidebar` 在 `document.body` 上创建一个 `<div>`，向其挂载第二个 React root，并用 `MutationObserver` 加一个持续运行的 `requestAnimationFrame` 测量循环保持挂载（`repos/DSH-better-sidebar/src/client/index.tsx:196-230`、`:280-296`）。这个表面无法进入 slot 账本，无法被其他插件替换，也不会随创建它的 entry 一起卸载。本地契约只允许一种组合 API——`ctx.slots.register({name, children?, store?, inject?}, Component)`，其中 `children` 既是声明也是渲染授权（`.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md:13-52`）。

## 决策

**`AppFrame` 声明第五个子 slot `workbench`，作为位于会话栏与详情栏之间的可选 single/root 栏。** 该栏是增量式的：没有注册方时它解析为零宽度、不渲染任何内容、也不绘制边框，因此不注册工作台的组合在视觉与行为上完全不变。`ui-layout` 的 SlotMap 增加该条目与一个恰好为 `{ collapsed, width }` 的 `WorkbenchOwnerProps` share，与侧边栏 owner share 对称；该栏是 root 作用域，因为工作台是工作区状态而非会话状态，因此能跨会话切换保留。

**让步链增加一项，并保持原有顺序：详情栏收缩 → 详情栏关闭 → 工作台收缩 → 工作台关闭 → 中心栏兜底。** 求解器保持纯函数且与断点无关；`ctx.layout` 在既有面板动作之外新增 `openWorkbench()`／`closeWorkbench()`，工作台拖动手柄沿用另外两栏相同的指针捕获加 rAF 节流写入路径。零宽度的工作台保持其子树挂载，与关闭的详情栏完全一致，因此重新打开时保留面板状态。

## 考虑过的替代方案

- **采用 `dsh-better-sidebar` 作为工作台外壳。** 它的注册契约是社区集合里最好的，正被抽取为面板 API；但 HEAD 要求 DSH ≥ 0.1.2-rc.1，而本套件固定在 rc.7，且它自身的表面是一个并行的 React root。挂载它会让同一个页面里出现两套组合机制。
- **占用 `details` slot。** 已否决：它会替换工具检查，其约定范围上限只有 520px，而且是会话作用域，工作台会在切换会话时卸载。
- **用 `shell.overlay` 做浮动工作台。** 已否决：该层点击穿透且位于栏轨道之外，停靠的文件树或编辑器无法让会话区重排。
- **通过修改随附行的行为来加栏。** 已否决：子声明在构造上就是增量式的；没有工作台注册时 `AppFrame` 的其他部分不变。

## 后果

工作台插件现在可以通过唯一被认可的 API 进行组合，第三方也可以通过占用该栏来整体替换工作台——它声明的座位随之消失，这与其他每一栏的接管语义一致。代价是一次核心包改动：一个 SlotMap 条目、一个 owner-share 接口、一个求解器项、一组 store 字段、一条网格轨道和一个拖动手柄。让步顺序现在是一份四路契约，测试钉住每一个接缝。

`packages/client/ui-layout/src/*` 处于 GUI 覆盖率欠账豁免范围内，因此本次改动不会移动仓库的覆盖率门槛；新增行为由该包自身的测试套件覆盖。

## 测试

`tests/columns.client.spec.ts` 钉住让步链：每一步、两个接缝（步骤 1/2 与步骤 4/5）、三个偏好的 clamp 行为、侧边栏永不退让的兜底，以及窗口变宽时的纯恢复。`tests/layout-store.client.spec.ts` 覆盖新增的 store 字段与动作（默认值、clamp、打开时保留拖动宽度、关闭归零、不持久化）。`tests/app-frame.client.spec.tsx` 覆盖渲染出的网格、workbench owner share、新增的拖动手柄及其向左缩放的计算、工作台与详情栏各自独立、以及窄视口下的让步。`tests/apply.client.spec.ts` 断言五个被声明的子项，包括 `workbench` 与 `shell.overlay`。`pnpm run test:gui` 与 `DSH_SNAPSHOT=replay` 的 web 通道覆盖组装后的浏览器。
