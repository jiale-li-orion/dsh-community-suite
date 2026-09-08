# DSH 进化日志

记录 DSH 的配置与源码改动，时间为本地时间（UTC+8），精确到分钟。

## 2026-09-08

### 22:41 · 运行中 DSH 的模型切换器加入内测模型

- 文件：`~/.dsh/settings.yaml`（`llm-deepseek.models`）
- 新增 `deepseek-v4.1-flash-expires-on-0910`（显示名 `DeepSeek-V4.1-Flash (Beta)`），与 `deepseek-v4-flash`、`deepseek-v4-pro` 并列，`baseURL` 保持 `https://api.deepseek.com`。
- 原因：`llm-deepseek` 的 `models` 是整体替换，不列出的模型会从切换器消失。

### 22:52 · 内测模型声明多模态：pi-ai 路由

- 文件：`~/.dsh/settings.yaml`（新增 `llm-pi-ai.providers.deepseek`）
- 端点与凭据沿用 `https://api.deepseek.com` + `DEEPSEEK_API_KEY`，内测模型声明 `input: [text, image]`。
- 校验：用运行中 DSH 自带的 `dsh-llm-pi-ai` schema 解析，该模型得到 `["text","image"]`（`pi-ai@0.82.1` 的 deepseek catalog 里根本没有这个 id，所以完全由 yaml 条目定义）。

### 22:54 · pi-ai 路由补回同族模型

- 文件：`~/.dsh/settings.yaml`
- `models` 列表补上 `deepseek-v4-flash`、`deepseek-v4-pro`：该列表会整体替换路由自带 catalog，不补会被移除。

### 22:56–22:59 · 源码：`llm-deepseek` 原生适配器支持图片输入

- 22:56 `packages/llm/llm-deepseek/package.json`：新增 `@deepseek-ai/dsh-attachment` peer/dev 依赖。
- 22:57 `tsconfig.json` 加工程引用；`src/types.ts` 新增 `WireTextPart`、`WireImagePart`、`WireUserContent`。
- 22:58 `src/serialize.ts`：用户消息图片序列化为 `image_url` 的 `data:` URL，纯文本消息保持裸字符串；`src/adapter.ts`：`DeepSeekCatalogModel.inputModalities`、`resolveAttachments`、每请求图片读取器。
- 22:59 `src/index.ts`：schema 增加 `inputModalities`（默认 `[text]`，显式空列表加载即报错）；`tests/serialize.spec.ts` 改为异步并新增图片用例。

### 23:00–23:06 · 测试与文档

- 23:00 `tests/adapter.spec.ts`、`tests/dynamic-config.spec.ts`：目录模态上报、mock server 端到端图片请求、无附件服务时发送前失败、实时 settings 声明模态。
- 23:01 `tests/serialize.spec.ts`：补空文本块用例，补齐分支覆盖。
- 23:02 包 README 中英、`docs/config-catalog.md` 与 `.zh.md` 同步更新。
- 23:03 新增 Agent Note 三件套 `.agents/notes/implemented/feature/2026-09-08-llm-deepseek-catalog-input-modalities.*`，并更新 pi-ai 那条 note 里「DeepSeek 适配器保持不动」的旧事实。
- 23:04 记录并校验翻译配对，961 对全部一致。
- 23:06 修复 `adapter.spec.ts` 的 `no-unsafe-assignment`。

### 23:04–23:13 · 验证

- 23:04、23:06 `pnpm run lint`：0 warnings 0 errors。
- 23:08 `pnpm run doc-sync`：27 通过、1 失败（`verify-md-links` 报 `docs/user/develop/basic/*` 指向 `README.md#run-from-source` 失效；原因是工作区里原有的未提交 README 改动改了该标题，与本次改动无关）。
- 23:11 `pnpm run hygiene`：全绿。
- 23:12 `pnpm run typecheck`：全绿。
- 23:13 `npx vitest run packages/llm/llm-deepseek`：170 通过；该包 `src` 语句/分支/函数/行覆盖率均 100%。

### 23:15 · 创建本日志

- 文件：`DSH进化日志.md`（仓库根目录）。

### 23:27 · `dsh` 命令切换到本仓库

- 新增 `~/.local/bin/dsh`（包装脚本）：`exec node --import <仓库>/node_modules/tsx/dist/esm/index.mjs <仓库>/apps/cli/src/bin.ts "$@"`，即仓库的源启动；并 `export TSX_TSCONFIG_PATH=<仓库>/tsconfig.json`，这样在任意目录调用都能命中工作区 `paths`（否则 `@deepseek-ai/cordis` 会解析到构建产物，缺 `FiberState`）。
- 新增 `~/.local/bin/dsh-official`：指向官方 `@deepseek-ai/dsh` rc.6，仅作对照。
- `~/.local/bin` 在 PATH 中位于 nvm 的 bin 之前，因此 `dsh` 现在解析到仓库版；官方安装未被改动。
- 验证：`dsh --version` → `0.1.0-rc.7`；`dsh-official --version` → `0.1.0-rc.6`；在 `/tmp` 下 `dsh web --help` 与 `dsh --profile web --dump-config` 均正常，cwd 保持不变（agent 工作区仍取自调用目录）。
- 启动时 `healProfilesModuleFallback` 会把 `~/.dsh/profiles/node_modules/@deepseek-ai/*` 指向仓库：`dsh-base`、`dsh-llm-deepseek` 现已指向 `apps/cli/node_modules/@deepseek-ai/...`。
- 加载来源实测（`NODE_DEBUG=esm`）：插件走的是**源码** `packages/llm/llm-deepseek/src/index.ts`——loader 的 `import(name)` 经 tsx 解析，命中 tsconfig `paths`。所以源启动下改插件 src 不需要重新构建；只有构建产物/已安装副本才加载 `lib/`。
- 隔离验证：`DSH_HOME=/tmp/dsh-verify dsh --profile web --port 0` 正常起服务并打印 `dsh web: http://127.0.0.1:45327`，未触碰运行中的实例。

### 23:30 · `~/.dsh/settings.yaml`：原生路由声明图片模态

- 在 `llm-deepseek.models` 的内测模型条目加 `inputModalities: [text, image]`。
- 校验：仓库 rc.7 解析为 `["text","image"]`；运行中 rc.6 的 schema 接受该未知字段、`resolveModels` 丢弃它（`undefined`），因此对当前进程无副作用。
- 该行只在 Part B 代码（仓库版）生效后才起作用；生效后 `deepseek-official` 即可发图片。

### 23:47 · 消除全局安装与源码版的版本歧义

- 根因：`~/.bashrc` 第 218 行先 prepend `~/.local/bin`，紧接的 nvm 块（第 221-223 行）又 prepend 自己的 bin，导致新 shell 里 nvm 的 `dsh`（全局安装的 rc.6）胜出。
- 修 `~/.bashrc`：在 nvm 块之后追加一段，把 `~/.local/bin` 去重后放回 PATH 最前。
- 卸载全局 npm 包 `@deepseek-ai/dsh@0.1.0-rc.6`（532 个包、359M），nvm 的 `dsh` 符号链接随之消失——PATH 上只剩 `~/.local/bin/dsh` 一个 `dsh`，不再有版本歧义。
- `dsh-official` 改指向官方**源码** checkout `~/agent-system-learning/deepseek-harness`（同样的 tsx 源启动 + 自己的 `TSX_TSCONFIG_PATH`），不再依赖 npm 包。
- 卸载会让 `~/.dsh/profiles/node_modules/@deepseek-ai/*` 变成悬空链接；跑一次仓库版 `dsh --profile web --dump-config` 已重新 heal 到仓库（0 悬空）。
- 验证：新 shell 中 `which -a dsh` 只有一条、`dsh --version` → `0.1.0-rc.7`、`dsh-official --version` → `0.1.0-rc.5`、`node`/`npm` 正常；隔离 home 启动成功 `dsh web: http://127.0.0.1:46417`。

### 23:50 · 修复 client bundle 构建产物漂移（HARNESS / Failed to load plugins）

- 现象：浏览器启动面板报 `failed to import loader entry (@deepseek-ai/dsh-api-remotes): client-modules: require("zod") missed the module table`。
- 根因：`packages/api/remotes/lib/client.js` 旧产物顶部留了 `let zod = require("zod")`（构建时被当作 external），而浏览器 module table 从不提供 zod（平台 seed 词表 `packages/client/web/src/seed.ts` + 已注册 factory），查表失败即导入失败。设计意图是 zod 必须内联（`packages/client/tsdown.client.ts:203`：zod 无跨插件共享身份）；`lib/` 被 gitignore，属本机早前某次不一致构建留下的坏产物。
- 修复：按仓库规定重跑 `pnpm run build:lib:client`（`tsc -b` + tsdown client pass），让全部 client bundle 从当前源码一致重建。**无源码改动。**
- 独立复核：全仓 `packages/*/*/lib/client.js` 已无任何 `require("zod")`；`api-remotes` 新产物（228,919 bytes、339 处 zod）内联了 zod，头部为 `window.__ModuleLoader__.load({ id, factory: (require) => ... })`；剩余 require 说明符仅 react / react-dom / react-jsx-runtime / cordis / dsh-client-ui-* / dsh-client-runtime/client / dsh-client-schema-form / dsh-client-web-react（均为允许的平台 external）。
- 生效方式：重启 harness + 浏览器硬刷新（rev 参数随 bundle 内容哈希自动换缓存）。
- 遗留风险（本次未处理，超范围）：tsdown 0.22 已把 `external`/`noExternal` 标为废弃，建议迁移到 `deps.alwaysBundle`/`neverBundle`；未来 tsdown 升级可能再次静默改变默认值产生同类漂移。

### 23:44 · 运行中的进程切到仓库版

- 新进程 `pid 271929`：`node --import <仓库>/node_modules/tsx/dist/esm/index.mjs <仓库>/apps/cli/src/bin.ts web`，即 dsh-community-suite 的源启动，Part B 与 `inputModalities` 全部生效。

### 23:58 · 修复"Thinking 不折叠、直接显示在正文"

- 现象：思考内容以普通 markdown 段落出现在 assistant 正文里，没有可折叠的 Think 行。
- 排查（逐层排除，客户端无责）：
  - `ReasoningRow.tsx` 与官方 checkout 逐字节相同；`useState(false)` 默认折叠；`DisclosureRow` 是 `{open && children}`，只有展开才渲染正文。
  - 服务端返回的 bundle 与构建产物 **md5 完全一致**（`5d138f188277` rev，429,837 bytes），内含 `useState)(false)` 与 `"Think"`。
  - 浏览器 DOM 实测：`[data-variant="think"]` 计数 **0**，`data-variant` 只有 read/write/bash/edit/others；思考文本落在 `s0yIRq_body`（即 `AssistantMarkdown.module.css` 的正文容器）。
  - 会话日志按块统计：同一句内部推理，在 `seq 19583` 落在 `reasoning` 块，在 `seq 249229` 落在 `text` 块 —— 说明**provider 把 CoT 发到了 `content` 字段**，而不是 `reasoning_content`。
- 根因：`agent-default-model.provider` 被切到 **pi-ai 的 `deepseek` 路由**，而该 profile 没有 `reasoning` 默认值，provider 因此不进思考模式。chunk 类型统计可证：原生路由时段 `reasoning-delta` **673** 个，pi-ai 时段 **0** 个（只有 103 个 `text-delta`）。
- 修复：在 `~/.dsh/settings.yaml` 的 `llm-pi-ai.providers.deepseek` 增加 `reasoning: high`（路由默认思考强度）与 `compat: { thinkingFormat: deepseek }`（手写模型无 catalog 条目可继承 compat）。用运行中仓库的 `dsh-llm-pi-ai` schema 校验通过。
- 注意：**已记录的历史轮次无法回溯折叠**——日志里它们就是 text 块；需要发新消息验证。

## 2026-09-09

### 00:12 · `~/.dsh/settings.yaml`：四个模型在两条路由上显式维护

- 丢失的配置：23:59:04 那次整文件 `write` 把 `llm-pi-ai` 整段清掉了（含 22:52–23:57 写入的模型条目、`reasoning: high`、`compat.thinkingFormat: deepseek`）；`deepseek-v4-flash-vision-exp` 则从未进入过 `llm-deepseek.models`。
- 现在两条路由各列同一份四模型清单，模态逐条标注：
  - `llm-deepseek.models`：`deepseek-v4-flash`、`deepseek-v4-pro` 为 `[text]`；`deepseek-v4-flash-vision-exp`（显示名 `DeepSeek-V4-Flash-Vision (Exp)`）、`deepseek-v4.1-flash-expires-on-0910` 为 `[text, image]`；均带 `contextWindow: 1000000`。
  - `llm-pi-ai.providers.deepseek.models`：同样四条；手写模型补 `contextWindow: 1000000`、`maxTokens: 384000`、`reasoningEfforts {off, high, max}`；路由级 `reasoning: high` 与 `compat.thinkingFormat: deepseek` 一并恢复。
- 校验：仓库源码 schema 解析两条路由（原生 4 条模态正确；pi-ai `resolveProfiles` 得到 4 条 wire 模型、`thinkingFormat: deepseek`）；再用 `DSH_HOME=/tmp/dsh-cfgtest` 隔离启动 headless，分别以 `deepseek-official` + v4.1、`deepseek` + vision-exp 跑通真实请求（均返回 `ok`）。

### 00:14 · 结论：v4.1 能读图片；"v4.1 不行"的真因是 tool result 里的图片

- 直连 `https://api.deepseek.com/chat/completions` 实测两张分别写着 ALPHA / BRAVO 的 PNG：
  - `deepseek-v4-flash`、`deepseek-v4-pro`：请求被服务端替换成 `[Unsupported Image]`（prompt_tokens 103，模型自己说没有图片）。
  - `deepseek-v4-flash-vision-exp`：两张都答对（prompt_tokens 199）。
  - `deepseek-v4.1-flash-expires-on-0910`：两张都答对（prompt_tokens 231）。**v4.1 支持图片输入，之前的判断是错的。**
- `/models` 只列出 flash、pro、vision-exp 三个 id；v4.1 是未列出的内测模型（当前会话就运行在它上面）。
- 真因：`packages/llm/llm-deepseek/src/serialize.ts` 只支持 **user 消息**里的图片，对嵌在 `tool-result` 里的图片一律抛 `UNSUPPORTED_CONTENT`（"does not support image content here."），且该断言与模型是否声明图片无关。主会话 23:55 两次 `read_image` 把图片写进了 tool result，历史里从此带着 2 张这样的图 → 该会话在原生路由上**任何模型**都失败（文本模型报的是 "for this model"）。
- 复现：从主会话日志重建 760 条消息（共 4 张图，其中 2 张嵌在 tool result），直接调用真实 `serializeRequest`，报错与运行中进程逐字一致；同一历史交给 pi-ai 的 `toPiContext`，4 张图全部承载。
- 因此主会话目前只能走 pi-ai 的 `deepseek` 路由继续。要让原生路由也能承接这类历史，需要把 tool result 里的图片提升到相邻 user 消息（pi-ai 的做法）——属源码改动，本次未做。

### 00:22 · 源码：`llm-deepseek` 承载工具结果图片

- `packages/llm/llm-deepseek/src/serialize.ts`：
  - 工具消息只发文本；一段连续的工具结果消息先发各自的 `role: 'tool'`，再发**一条** user 消息，首分片是字面量 `Attached image(s) from tool result:`，随后按内容顺序每个图片一个 `image_url` data URL。该形状与 pi-ai 的 openai-completions 路径发给同一端点的形状一致。
  - 只有图片没有文本的工具结果以 `(see attached image)` 过线（此前会直接报错）。
  - 图片按 `contentHasImage` 同一递归在任意嵌套深度收集；没有图片读取器（模型未声明 `image`）时在协议之前以 `UNSUPPORTED_CONTENT` 拒绝；system/assistant 角色仍拒绝。
- 验证：`serialize.spec.ts` 新增 5 个用例（单条、跨消息批合并、嵌套、段结束、无读取器拒绝），包内 174 测试通过、`src` 覆盖率仍 100%；用主会话真实历史（760 条消息、2 张 tool-result 图）重建请求，`serializeRequest` 产出 762 条 wire 消息且不再抛错；把该请求体直接发给 `api.deepseek.com`，v4.1 与 vision-exp 都正确读出 `ALPHA` / `BRAVO`。
- 生效方式：插件源码经 tsx 加载，改动要**重启 harness** 才生效（模块已缓存）。

### 00:26 · 文档与 Agent Note

- 新增 `.agents/notes/implemented/feature/2026-09-09-llm-deepseek-tool-result-images.md`（含 `.zh.md` 与 i18n 记录）；旧 note `2026-09-08-llm-deepseek-catalog-input-modalities` 中「工具结果图片一律拒绝」的决策被取代，两个 note 互相链接。
- 归档 `.agents/notes/implemented/simplification/2026-07-04-drop-image-content-block.*` → `archived/simplification/`（其「直到有路径能承载」的复归条件已满足），修复两处活跃 note 的入链，`verify-archived-agent-notes --write` 已封存。
- 包 README 中英同步更新，i18n 配对全部重录（961 对一致）。
- 门禁：`lint` 0 warnings 0 errors；`typecheck` 全绿；`doc-sync` 26 通过、仅剩既有 `docs/user/develop/basic/*` 指向 `README.md#run-from-source` 的 4 条失效链接（与本次改动无关）。

### 00:34 · 切换器只保留原生路由的四条模型

- 文件：`~/.dsh/settings.yaml`：删除 `llm-pi-ai` 整段（`providers.deepseek`、四条模型条目、`reasoning: high`、`compat.thinkingFormat: deepseek`），只留 `llm-deepseek.models` 的四条。
- 原因：原生路由自 00:22 起已能承载工具结果图片，孪生路由不再需要，去掉后切换器不再出现重复条目。
- 校验：用仓库源码 schema 解析——`llm-deepseek` 得 4 条（模态不变），`llm-pi-ai` 得 0 条路由（休眠）。运行中的 `pid 585160` 会热重载该文件，无需重启。

### 01:15 · 社区插件审计完成 + 工作台第一步（源码）

**审计**（工作区 `/home/orion/agent-system-learning/community-audit/`，不进仓库）

- 15 个仓库全部浅克隆并逐仓审计，产出 `notes/<repo>.md`（每篇八个固定小节：快照／架构／服务契约／host-client 扩展点／可组合性／复用裁决／风险与性能／证据索引），另有 `notes/_local-baseline.md`（本仓库扩展点基线）、`SYNTHESIS.md`（裁决矩阵、许可约束、跨切模式、增量计划）、`ARCHITECTURE-DECISIONS.md`（ADR-1…8，含回滚方案）。
- 裁决：`reuse as-is` 仅 1 个（`ZSeven-W/dsh-android`，MIT、零核心补丁）；其余 14 个为 `extract design` 或 `skip`。关键否决依据：`dsh-better-sidebar` HEAD 要求 DSH ≥ 0.1.2-rc.1 且用 `document.body` + 第二个 React root 绕过 slot 契约；`DSHBox`(GPL-3.0) 与 `dsh-android-app`(AGPL-3.0) 与 MIT 套件许可不兼容，只能取设计。
- 审计结论：缺口不在 host 能力（`fs`/`terminals`/`subprocess`/`jobs`/`attachments`/`webServer` 都在），而在客户端没有任何可挂载多面板的工作台栏位。

**Phase 1 源码**（`packages/client/ui-layout`）

- `columns.ts`：让步链加入 workbench，顺序为「详情栏收缩 → 关闭 → 工作台收缩 → 关闭 → 中心栏兜底」；新增 `WORKBENCH_MIN/MAX/DEFAULT = 320/1200/560`。
- `stores.ts`：新增 `workbench` 状态与 `setWorkbench/openWorkbench/closeWorkbench`；`index.ts`：SlotMap 与 `children` 声明 `workbench`（single/root）并新增 `WorkbenchOwnerProps { collapsed, width }`；`AppFrame.tsx`：第四条网格轨道 + 拖动手柄；`AppFrame.module.css`：`.workbenchCol` 与胶囊样式；`service.ts`：`openWorkbench/closeWorkbench`。
- 关键性质：**无注册方时零宽度、不渲染、不画边框**，随附行为不变；零宽度时子树保持挂载。
- 连带生成物：`packages/extensions/cordis-client-runner/src/client/slot-catalog.ts` 由 `pnpm run gen-client-catalog` 重生成（新增 `workbench` 条目）。
- 文档：ui-layout README 中英更新（三栏→四栏、五个 owner-share）；新增 Agent Note `.agents/notes/implemented/feature/2026-09-09-workbench-column-slot.{md,zh.md}`。
- 验证：ui-layout 66 测试通过；`pnpm run test:gui` 277 文件 / 3819 测试通过；`DSH_SNAPSHOT=replay pnpm run test:web` 76 文件 / 255 测试通过（空栏不改动组装后的浏览器）；`lint` 0/0；`typecheck` 绿；`doc-sync` 28 通过 0 失败。
- 回滚：删除 `workbench` 子声明 + 求解器项 + store 字段 + 网格轨道 + 拖动手柄，并重跑 `gen-client-catalog`。

### 01:35 · Phase 2：`ui-workbench` 面板座位与 `ctx.workbench`

- 新包 `packages/client/ui-workbench`：占用 Phase 1 的 `workbench` 栏，声明 `workbench.panel`（list/root）座位，注册 `conversation.session.header.utilities` 里的开关（id `workbench-toggle`），并发布客户端服务 `ctx.workbench`。
- 面板契约：**面板就是一条 slot 注册**（`ctx.slots.inject('workbench.panel', () => ctx.slots.register({ name, id, order, label }, Component))`），没有并行注册表；`id` 是派发键，外壳用 `renderSlot('workbench.panel', { width }, { only: <id> })` 只挂载被选中的面板，未注册的选择回退到第一个标签。
- 数据流：外壳把账本投影成 `SnapshotStore<readonly WorkbenchPanelTab[]>`（`ctx.slots.entries` + `subscribe`），经 inject 的 `hooks` 隔间绑定为 `usePanels`；选择存在外壳 entry 的 store 里；`ctx.workbench` 只暴露 `open(panelId?)/close()/toggle()` 三个切换，控制器由注册项 inject 钩子接线（与 `ctx.layout` 同构）。
- `ui-layout` 补 `toggleWorkbench`（store 动作 + `ctx.layout` 方法），让头部开关成为真正的开关。
- 头部开关（`conversation.session.header.utilities`，id `workbench-toggle`，order `-10`）排在会话自身工具之前，保持「会话日志导出」在头部右边缘的几何契约；**收起的栏返回 null**，不进无障碍树（组件仍挂载，选择存活）。
- 装配：`tsconfig.base.json` paths、`tsconfig.client.json` 工程引用、`packages/bundle/web-app/{package.json,cordis.patch.yml}` 各加一条；`pnpm install` 更新 lockfile；`gen-client-catalog` 与 `gen-config-catalog` 重新生成；`gen-cordis-catalog` 的 `SERVICE_WALK_EXEMPTIONS` 与 `verify-package-readme-model-experience` 的 `SENTENCE_MODEL_EXPERIENCE` 各加一条。
- 文档：包 README 中英；新增 Agent Note `.agents/notes/implemented/feature/2026-09-09-workbench-panel-seat.{md,zh.md}`。
- 验证：新包 18 测试 + ui-layout 67 测试通过；`test:gui` 279 文件 / 3837 测试通过；`lint` 0/0；`typecheck` 绿；`hygiene` 全绿（knip 抓出未用的 `clsx` 依赖已删）；`doc-sync` 28 通过 0 失败（含 `doc-typecheck` 的 opt-out 比例、cordis/config catalog、README Model Experience、翻译配对）；`DSH_SNAPSHOT=refresh` 更新 46 个 aria golden（新增 `button "Workbench"` 等），随后 replay 全绿。
- 回滚：删掉该 bundle 行与包目录，重跑 `pnpm install` 与两个 catalog 生成器。

### 01:30–01:40 · 桌面快捷方式：双击 → WSL 里起 `dsh web` + 自动开浏览器

- 位置（**全在 Windows 桌面，不进本仓库**）：`C:\Users\29461\Desktop\DSH Web.lnk`、`Desktop\dsh-web\{launch.cmd,dsh-web.sh,README.md}`。
- `launch.cmd` 执行 `wsl.exe -d Ubuntu --cd "~" -- bash -lic "exec bash /mnt/c/.../dsh-web.sh %*"`；`-lic` 是硬要求——`dsh` 在 `~/.local/bin`、node 来自 nvm，二者只在登录 shell 的 PATH 里（实测 `bash -lic 'command -v dsh'` → `/home/orion/.local/bin/dsh`）。
- 生命周期契约：控制台窗口即持有者。`dsh-web.sh` 前台跑 `dsh web`、后台起"等端口"子进程；关浏览器不影响 dsh，关窗口/`Ctrl+C` → SIGHUP → trap → TERM(最多 6s) → KILL。
- 开浏览器：轮询 `127.0.0.1:$PORT`（bash `/dev/tcp`）连通后再 `cmd.exe /c start`，避免打开一个打不开的页面；端口取自 `--port/--port=N` 或 `DSH_WEB_PORT`，默认 3080。端口已被占用时走"已在监听"分支：不起第二个实例，只开浏览器并提示按任意键。
- 实测（真实窗口路径，`launch.cmd --port 3099`）：源码版 15s 起来，Windows 侧 `Invoke-WebRequest http://127.0.0.1:3099/` = **200**，msedge 自动打开（进程启动时间对得上）；`taskkill /PID <cmd> /T /F` 模拟关窗后端口 2s 内释放、launcher 与 node 进程归零、3080 上运行中的会话不受影响。`Invoke-Item` 双击快捷方式同样正常拉起。
- 事实校验：Windows 进程**不继承** WSL 的环境变量（`export DSH_PROBE_VAR=hello; cmd.exe /c echo %DSH_PROBE_VAR%` 原样输出 `%DSH_PROBE_VAR%`），所以从快捷方式起的 dsh 不会继承当前 agent 会话身份；脚本仍显式 `unset DSH_SESSION_ID/DSH_SESSION_JSONL/DSH_SHELL/DSH_WEB_URL`，以防从 dsh 工具 shell 里调用。
- WSL2 localhost 转发使 Windows 浏览器可直接访问 WSL 内监听 `127.0.0.1` 的服务（实测 200）。

### 01:52 · 快捷方式图标：会话附图 → 七尺寸 `.ico`

- 源图：会话附件 `~/.dsh/attachments/v1/objects/2f/2fd67ca6…`（1254×1254 PNG，四角纯黑 `(0,0,0)`）。
- 直接当图标会是个黑方块，故从**图像边框做四连通洪水填充**抠掉与边框连通的近黑区域（`L<16`，实测 191934/1572516 像素），再 1.2px 羽化 alpha：圆角外的黑变透明，而方块**内部**的深色屏幕不会被打穿（纯亮度阈值一定会打穿）。
- `make-icon.py` 产出 `dsh-web.ico`（16/24/32/48/64/128/256）与 `dsh-tile.png`（透明版全尺寸，供启动块用）。
- 验证：PIL 读回七个尺寸；`[System.Drawing.Icon]::ExtractAssociatedIcon` 渲染 32×32 成功（证明 Windows 侧能加载）；`ie4uinit.exe -show` 刷图标缓存。

### 01:56 · 启动目录改为 `~`：工作区是每会话自选

- `launch.cmd` 的 `WORKDIR` 从桌面改为 `~`。依据本仓库源码：`packages/client/ui-directory-picker-browse`、`WorkspaceRuntime`，会话创建接口 `create({ workspaceId?, cwd? })`（`packages/client/runtime/src/client/sessions/service.ts`）——工作区按会话选，启动目录只是新会话的默认值。
- 附带：API key 来自 `~/.bashrc` 的 export，`-lic` 进来就有，不依赖 `.env`。

### 02:00 · 开始菜单入口；"固定到开始屏幕"无法脚本化

- 建了 `%APPDATA%\Microsoft\Windows\Start Menu\Programs\DSH Web.lnk`（同一目标/图标），`Get-StartApps` 已收录 `DSH Web`（`Win` → 输入 `dsh` 可搜到）。
- **自动化固定失败，证据**：`Shell.Application` 动词枚举（桌面版与开始菜单版快捷方式）都没有"固定到开始屏幕"；直接调 `pintostartscreen`/`startpin`/`PinToStartScreen` 三个规范名后，开始菜单布局文件 `start2.bin` 的 size/mtime/md5 **完全不变**；`HKCR\lnkfile\shell` 下也没有该动词注册项。Win11 新版右键菜单不暴露给 `Shell.Application`，任务栏固定同样被系统禁止。
- 所以"固定 + 调整大小→大"必须手动点 3 步；且 Win11 磁贴最大是"大"=2×2 格，而桌面图标尺寸是**全局单值**（`HKCU\Software\Microsoft\Windows\Shell\Bags\1\Desktop\IconSize` 当前 39px，上限 256），单个图标无法单独放大——这就是本机没有"单个桌面图标变大"路径的原因。

### 02:05–02:20 · `DshTile.exe`：桌面大启动块（鼠标可缩放）

- 位置：`Desktop\dsh-web\{DshTile.cs,DshTile.exe,dsh-tile.png,tile.ini,tile-stop.cmd}`；用系统自带 `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /target:winexe /reference:System.Drawing.dll` 编译，**零依赖零安装**，26KB。注意该 csc 是 C# 5 编译器（无字符串插值/表达式体/`nameof`/空条件运算符）。
- 交互：左键单击启动 `launch.cmd`；拖动图面移动（存 `tile.ini`）；拖右下角**缩放把手**自由缩放 128–1600px；图面滚轮步进缩放；右键菜单（启动/尺寸预设/重置尺寸/打开文件夹/退出）。
- 三个实测坑：
  1. **WinForms + `UpdateLayeredWindow` = 纯黑方块**：Form 创建句柄后重排/重绘会冲掉图层表面（日志：首次 `ok=True`，随后 WM_PAINT 里 `ok=False, winerr=87`）。改为**裸 Win32**（`CreateWindowEx` + 自建消息循环 + 32bpp 预乘 alpha DIB）后正常。
  2. **缩放把手拖不动**：图层窗口里 alpha=0 的像素**穿透点击**，而原图圆角正好透明，把手最初画在窗口最右下角 → 点击落到桌面。改为**实心圆角小方块**画在图面内部不透明区，命中区跟随把手（实测 `mouse down … resize=True` → `resized to 400`）。
  3. **"嵌桌面"模式可见性不稳**：`SetParent` 到 `Progman` 能被点，但壁纸轮换时会被 WorkerW 盖住（时有时无）。默认改为**顶层窗口 + 每秒 `SetWindowPos(HWND_BOTTOM)`**，实测可见且可点击（`mouse down … resize=False` → `launched`）；嵌入模式保留为 `--embed`。
- 窗口性质：逐像素 alpha；`WS_EX_NOACTIVATE` + `MA_NOACTIVATE` 不抢焦点；无任务栏按钮；吞 `SC_MINIMIZE`，`Win+D` 不隐藏它。
- 诊断：`--diagnose` 打印桌面层级（本机：`Progman 0x10164 → SHELLDLL_DefView → SysListView32`）；`--reset` 重置位置；`--size N` 指定尺寸。
- 两个被纠正的误判：**Progman 是存在的**——PowerShell 里 `$null` 会 marshaling 成空串，`FindWindow('Progman', $null)` 因此一直返回 0（C# 传真 NULL 才命中）；真实虚拟屏是 **5120×1800 @125%**，早期截图是 0.8× 缩放，按截图算的像素坐标都偏了。
- 验证：合成点击 → `launched`；合成拖把手 → `resized to 400`；滚轮 → 520→609；用户实操已缩放到 1191px 并拖动使用。
- 开机自启：`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\DSH Web tile.lnk`；`tile-stop.cmd` 是菜单之外的备用关闭方式。

## 待办与注意

- 00:46 的两批改动已提交并推送到 `origin/main`（`33b890f`）；工作台 Phase 1 = `0e3d00a`、Phase 2 = `2414fda`，两者均为本地提交，尚未 push。
- 运行中的 harness 要看到工作台，必须**重启**：Phase 2 新增了一条 bundle 行（组合变化），且 client bundle 的 rev 在启动时计算。
- 后续阶段：host 共享状态服务与推送（ADR-3）、Range 流式路由（ADR-4）、agent 自写扩展与插件目录发现（ADR-5/7）——计划见 `community-audit/SYNTHESIS.md`。
