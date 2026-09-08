# @deepseek-ai/dsh-client-ui-workbench

[English](README.md) | 中文

工作台栏：ui-layout 可选 `workbench` slot 的占用者，也是其他插件贡献面板的座位。外壳渲染标签条（每个已注册面板一个标签，按注册 `order` 排序），并通过 keyed 的 `workbench.panel` slot 只派发被选中的面板，因此面板组件只在其被选中时挂载。没有任何面板时该栏显示空状态；被用户关闭时它不渲染任何内容，但保持子树挂载。

## 贡献一个面板

面板插件通过普通 slot API 注册进已声明的座位——没有另一套注册表要调用：

面板插件通过普通 slot API 注册进已声明的座位——没有另一套注册表要调用。注册项携带标签身份：

- `id`——外壳用于派发的面板 id（必填；没有它的条目会被标签投影忽略）。
- `order`——标签升序；同序时保持注册顺序。
- `label`——字符串或 thunk，读取时经注册方自己的 locale 解析。
- `locale`——可选；给组件提供带类型的 `t` 座位。

组件接收四个标准 share 加上面板 owner share `{ width }`——已解析的栏宽，因此面板可以适配窄栏。注册是 effect：销毁注册方的 fiber 会连同标签一起移除该面板。

组件接收四个标准 share 加上面板 owner share `{ width }`——已解析的栏宽，因此面板可以适配窄栏。注册是 effect：销毁注册方的 fiber 会连同标签一起移除该面板。

## 栏位切换（`ctx.workbench`）

`ctx.workbench` 是跨插件的切换面：`open(panelId?)` 选中一个面板并打开该栏，`close()` 关闭，`toggle()` 翻转。栏的几何本身属于 `ctx.layout`（`openWorkbench`／`closeWorkbench`／`toggleWorkbench`）；workbench 面只增加选择写入，因此命令和头部按钮可以直接打开指定面板而不必触碰布局 store。

会话头部开关（`conversation.session.header.utilities`，id `workbench-toggle`）是内置入口。它不携带实时栏状态：关闭由外壳头部负责，切换由布局面负责。

## 模型体验

无。工作台管理的是浏览器查看状态；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与暂缓事项

- **面板是 root 作用域的**：面板会跨会话切换保留，并通过标准 `useSessions` 钩子读取当前会话；按会话隔离的工作台需要换成会话作用域的座位。
- **一次只显示一个面板**：外壳只派发一个被选中的面板；并排分栏与拖动重排标签暂缓，直到有消费方需要。
- **面板选择不持久化**：与栏的几何一样，选中的面板在重新加载后重置（ui-layout 的面板 store 是瞬时的）。
