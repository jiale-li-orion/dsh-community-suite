# Agent Note：背景是一条声明的框架座位，不是 body 层

Status: implemented

[English](2026-09-09-wallpaper-background-seat.md) | 中文

## 问题

被审计的 `dsh-wallpaper-engine` 通过在 `body` 上追加一层 `z-index: -2` 的元素、并耦合 shell 内部 DOM 与主题钩子来画背景（`notes/dsh-wallpaper-engine.md:46`）。它的审计结论是 `extract design`，正是因为那一层不可回收：它位于槽位树之外，没有任何东西拥有它的拆卸，shell 一改就可能移位。工作台需要的是**功能**——把工作区图片画在会话背后——而不是那个脆弱的绘制目标。

## 决策

**框架声明一条背景座位。** `ui-layout` 新增 `shell.background` 列表槽位：一层全幅、可穿透点击的图层，按文档顺序渲染在栏位之前，于是栏位在自己画表面的地方盖住它，会话列没画表面的地方露出它。各栏位**刻意不带 `z-index`**：任何一栏一旦建立堆叠上下文，就会把注册在它子树里的 fixed 定位对话框（设置模态框就渲染在 `sidebar.settings` 下）压在后面的栏位之下。想画这个表面的功能只需注册一条条目，于是图层的生命周期就是该条目的 fiber，堆叠顺序由外壳拥有。`shell.overlay` 座位不能胜任：它按设计画在所有栏位之上。

**壁纸 = 一个工作台面板 + 那一条条目。** `@deepseek-ai/dsh-client-ui-workbench` 注册 `wallpaper` 面板（order 30），它通过与文件面板同一道受围栏保护的列举列出当前会话的图片文件；同时注册一条 `shell.background` 条目，把选中的图片连同遮罩画出来。选择存在插件持有的一个快照 store 里，以 `ctx.wallpaper` 暴露；面板写它，背景条目经自己的 inject `hooks` 隔间读它——两个注册彼此都不伸手。

**选择属于浏览器本地，并且容错。** 它按浏览器持久化在带命名空间的键下；会话已消失的 URL 只会加载失败，此时图层自行隐藏，而不是留一个坏背景。这个选择不进入 host、不进入 agent、也不进会话日志：一个人喜欢哪张图不是会话状态。

## 考虑过的替代方案

- **追加 body 层（被审计项目的做法）。** 否决：位于槽位树之外，没有 fiber 拥有它，也没有声明授权它。
- **经 `shell.overlay` 加负 z-index 画。** 否决：overlay 自己的堆叠上下文在所有栏位之上，子元素无法可靠地画到它们背后。
- **用图片 URL 覆盖主题 token。** 否决：token 目录的类型是 `CSS color` 且带校验，把 URL 塞进颜色 token 会破坏所有按颜色读它的消费者。
- **替换 `conversation` 或 `root` 座位。** 否决：为了画一张图而遮蔽随产品发布的 UI。
- **把壁纸持久化到 host。** 否决：它是每个浏览器的口味；放进共享状态会让一个窗口的图片变成另一个窗口的。

## 后果

一张壁纸现在只需一条声明的座位、一个面板和一个小 store；删掉 bundle 行就同时删掉图层与面板，没有条目注册时框架毫无变化。遮罩保证任何图片上方的会话文字都可读。代价是 `ui-layout` 多了一条核心侧座位（与工作台栏一样是增量的）、面板经文件面板同一道受围栏保护的列举浏览工作区，以及一条对所有栏位成立的层叠约束：给其中任何一栏加 `z-index`，都会重新把它内部注册的对话框压到下面。

## 测试

`packages/client/ui-workbench/tests/wallpaper.client.spec.ts` 覆盖 store/service 与其存储容错（缺失、不可解析、形状错误、拒绝写入）。`tests/wallpaper-panel.client.spec.tsx` 覆盖无会话态、图片过滤、URL 构造、当前选择行、清除、空与失败的列举、非 Error 拒绝、卸载后才落地的结果，以及背景图层的渲染、加载失败隐藏与空态。`tests/browser-plugin.client.spec.ts` 覆盖服务、两条注册及其拆卸；`packages/client/ui-layout/tests` 覆盖带新座位的框架。`pnpm run test:gui` 与 `DSH_SNAPSHOT=replay` 的 web 车道覆盖组装后的浏览器。
