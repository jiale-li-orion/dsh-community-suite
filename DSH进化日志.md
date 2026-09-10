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
- 两个被纠正的误判：**Progman 是存在的**——PowerShell 里 `$null` 会 marshaling 成空串，`FindWindow('Progman', $null)` 因此一直返回 0（C# 传真 NULL 才命中）；坐标空间见 02:30 那条的"坐标坑"（125% 缩放下 DIP 与物理像素差 1.25 倍，早期按截图缩放换算的像素坐标全偏了）。
- 验证：合成点击 → `launched`；合成拖把手 → `resized to 400`；滚轮 → 520→609；用户实操已缩放到 1191px 并拖动使用。
- 开机自启：`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\DSH Web tile.lnk`；`tile-stop.cmd` 是菜单之外的备用关闭方式。

### 02:30–03:00 · 桌面启动块支持换皮肤（含两张非方形图）

- 位置：`Desktop\dsh-web\{DshTile.cs,DshTile.exe,make-skins.py,skins\1-original.png,2-heart.png,3-hands.png,tile.ini}`。
- 皮肤即 `skins/` 里的图片，按文件名排序循环；`tile.ini` 新增 `skin=` 记住当前皮肤。
- **非方形**：窗口不再假定正方形——`size` 语义改为**高度**，宽度 = `round(size × 图片宽高比)`。实测三套在 `size=420` 时分别为 420×420（原图）、290×420（`2-heart`，比例 0.691）、300×420（`3-hands`，比例 0.714）。
- 两张新图本身已是 RGBA 透明背景（四角 `alpha=0`，透明占比 51.7% / 46.2%），不需要抠图；`make-skins.py` 只做「按 `alpha>8` 裁到内容框 + 1.5% 留白」：1159×1357 → 932×1349、1086×1448 → 1010×1415。
- 换肤交互：右上角一个**实心圆盘 + 顺时针圆弧箭头**按钮（几何绘制，不依赖字体），点一下切下一套；右键菜单新增「皮肤」子菜单可直接点名。按钮必须实心——图层窗口里 alpha=0 的像素穿透点击，浮在透明区上会点不到。
- 验证（合成鼠标 + 截图）：三次点击日志依次 `skin -> 2-heart.png (310x448)`、`skin -> 3-hands.png (320x448)`、`skin -> 1-original.png (448x448)`；`size=420` 时窗口实测 420×420 / 290×420 / 300×420，`tile.ini` 的 `skin=` 同步落盘。
- 坐标坑（记录以免再踩）：这台机器 125% 缩放。**非 DPI-aware 的 PowerShell** 里 `GetWindowRect` 返回 DIP（= 物理 × 0.8），`SetCursorPos` 也按 DIP 解释；而 DPI-aware 的启动块日志是物理像素，所以合成点击要用 `物理 ÷ 1.25`（否则点到旁边的浏览器上）。另外 `CopyFromScreen` 截出来的是**物理像素 1:1**——用任务栏标定：任务栏 DIP 是 y 912..960，在截图里出现在 y 1140..1200。早期把截图当 0.8× 缩放来裁剪，全偏了。

### 03:05–03:55 · Phase 3：共享工作台状态（host 服务 + 推送 + 文件面板）

- 新 host 服务包 `packages/workbench/workbench`（`@deepseek-ai/dsh-workbench`）：`WorkbenchService extends TypertRemoteService`，`static inject = ['fs','sessions']`，只持有一个 `WorkbenchView = { open, active }`。`@Remote` 方法 `state/open/close/select/toggle/listDir`；每次提交（`open`/`close`/`select`/`toggle` 都走同一个 `commit`）更新字段并 `emit('workbench/changed', 提交后的副本)`，没有第二份状态需要同步。
- **单一权威**：浏览器手势与 agent 工具调用写同一个值。客户端不再自己推导开关/选择，只把 host 推送投影到 ui-layout 的栏与选择 store；刷新页面时先读一次 `state()`，早于外壳挂载到达的视图排队等 `attachActions`（不丢推送）。
- **推送通道**：`workbench/changed` 加入 `packages/api/remotes/src/remote-events.ts` 的 `API_REMOTE_FORWARDED_EVENTS`，客户端用 `ctx.remote.$on` 订阅；事件在 `src/types.ts` 里用声明合并定义（`@mode emit`），`api/remotes` 与 `host/apiproxy` 各加 `import type {} from '@deepseek-ai/dsh-workbench/types'` 与工程引用。
- 工具包 `packages/workbench/tool-workbench`（`@deepseek-ai/dsh-tool-workbench`）：`workbench_open`（可选 `panel`）、`workbench_close`、`workbench_status`，`inject = ['tools','workbench']`，返回面向模型的短通知（`Workbench opened on panel "files".` 等）+ `{text,open,active?}`，每次调用一张 generic 卡片；**工具不碰浏览器**，只写服务。
- 文件面板：`workbench.panel` 的 list 座位里注册内置面板 `files`（order 10）。读取走 `listDir(sessionId, path)`，用**会话记录的 cwd** 作栅栏（`ctx.fs.resolve` + `contains` + `listDir`），越界抛 `WorkbenchFenceError`（code `WORKBENCH_OUTSIDE_WORKSPACE`）；面板显示根目录名/上级行/尺寸（B·KB·MB），目录可点进去，`other` 类型行禁用。
- 不变式：`workbench/workbench/src/invariant.ts` 断言每次 `workbench/changed` 的载荷等于服务当前持有的状态——这是两端唯一的投影，陈旧载荷会让它们静默分叉，因此必须 fail loud（已用"发出不匹配载荷"的用例覆盖）。
- 装配：`tsconfig.base.json` paths、`tsconfig.host.json` 工程引用、`packages/api/remotes` 与 `packages/host/apiproxy` 依赖、`packages/bundle/web-app/{package.json,cordis.patch.yml}` 两条行（`workbench`、`tool-workbench`，排在 `ui-jobs` 前）；`gen-cordis-catalog`/`gen-doc-graphs`/`gen-tool-catalog` 加登记，新增 `docs/subsystems/workbench.md(.zh)` 子系统页并重生成四个 catalog；Agent Note `.agents/notes/implemented/feature/2026-09-09-workbench-shared-view.{md,zh.md,i18n.yaml}`。
- 两个坑：**cordis 会代理服务实例**，所以 host 服务的私有字段必须用 TS `private` 而非 JS `#view`（`#` 字段在代理对象上读不到）；**list 座位注册强制 `options.id`**，因此投影里 `id ?? ''` 的兜底分支不可达，按仓库既有先例加 `/* v8 ignore next -- list-slot registration requires options.id */`。
- 验证：`packages/workbench/*` + `packages/client/ui-workbench` 共 7 个测试文件 / 52 测试通过，且按新包范围跑的 per-file 覆盖率**四项均 100%**（补了 FilePanel、WorkbenchToggle、store、投影/注入/列表失败等用例）；`test:gui` 279 文件 / 3840 测试通过；`typecheck` 0；`lint` 0/0；`hygiene` 全绿（knip 抓出多余 `dsh-tools` 依赖已删、constraints 抓出 tool-workbench 的 `files` 列表多一项已改）；`doc-sync` 28/28。
- 回滚：删两条 bundle 行与两个包目录，撤掉 tsconfig 引用/catalog/文档登记，重跑 `pnpm install`。

### 03:30–04:30 · 手机通过 Tailscale 访问 dsh web

- 目标：手机（`100.93.98.104`）用浏览器访问电脑（`100.77.160.68`）上的 dsh web。三层缺一不可，逐层实测。
- **第 1 层 · 可达性**：`dsh web` 只绑 `127.0.0.1`（`--host 0.0.0.0` 被 `packages/bundle/web-app/src/startup.ts` 明确拒绝），手机够不着。实测：WSL 里监听 `0.0.0.0:3081`，从 Windows 走 Tailscale IP **连不上**（超时）；同一端口改由 **Windows 侧**监听就通。原因：WSL 是 mirrored 网络模式（`%USERPROFILE%\.wslconfig` 的 `networkingMode=mirrored`），Linux 监听器只经 **loopback 中继**被 Windows 看到，而 Tailscale 的包落在 **Windows 网络栈**。故新增 `win-tcp-forward.py`（Windows Python + asyncio 的 TCP 转发）`0.0.0.0:3081 → 127.0.0.1:3080`，开机自启 `shell:startup\DSH Web forward.lnk`，停止用 `forward-stop.cmd`。
- **防火墙无需改动**：`Tailscale-In` 入站规则是「任意端口 / 任意程序 / Domain+Private」，而 `Get-NetConnectionProfile` 显示 Tailscale 网卡是 **Private**（WLAN 是 Public，所以局域网方向仍被挡）。
- **第 2 层 · Host 围栏**：`packages/client/connection/src/api-request-trust.ts` 对每个 `/api` 请求要求 Host 是 loopback 或 `trustedHosts` 权威名（实测 `Host: evil.com` → 403、`Host: 100.77.160.68:3080` → 403）。在 `~/.dsh/profiles/web/cordis.patch.yml` 里**追加**：`trustedHosts: !!js [...ctx.webStartup.trustedHosts, 'node.tail0d75db.ts.net', '100.77.160.68']`（该行 config 是整体替换，故 `printUrl`/`surfaceContext` 一并重述）。dsh 的 `watchUserPatches` 热加载——**当前会话没重启就生效了**。
- **第 3 层 · 浏览器**：电脑上的系统代理（Clash `127.0.0.1:7897`，`ProxyOverride` 不含 `100.*` / `*.ts.net`）会把 tailnet 地址也代理掉，本机自测必须用 `curl.exe --noproxy '*'`，否则看到的是假 502 / 假超时（这个坑花了几轮才定位，一度误判成防火墙）。
- 验证（全部绕过代理）：`http://node.tail0d75db.ts.net:3081/` → **200**、`http://100.77.160.68:3081/` → **200**、tailnet Host 的 `/api/health` → 404（围栏放行）、`Host: evil.com` → 403（拒绝）；`127.0.0.1:3080` 上运行中的会话全程不受影响。
- **Tailscale Serve 其实是可用的（重要更正）**：先前几轮测出 `tailscale serve --bg --http=…` 对本机任何后端都 502，并据此判定 Serve 不可用——**错**。真因仍是系统代理 Clash：`Invoke-WebRequest` 走代理 → Clash 回 502。用 `curl.exe --noproxy '*'` 复测，`tailscale serve --bg --http=3082 http://127.0.0.1:3080` → `http://node.tail0d75db.ts.net:3082/` 返回 **200**（`serve → WSL loopback` 这条路本身没问题）。教训：在这台机器上任何涉及 `*.ts.net` / `100.*` 的 HTTP 探测都必须先 `--noproxy '*'`，否则得到的是代理的错误。
- HTTPS 证书仍拿不到：`tailscale cert node.tail0d75db.ts.net` → `500 your Tailscale account does not support getting TLS certs`（需在管理台 DNS 页开启 HTTPS Certificates）。手机端现象：浏览器把 `http://…:3081/` 升级成 HTTPS 后报 **-107（Chromium ERR_SSL_PROTOCOL_ERROR）**——注意 SSL 错误说明 TCP 已连通，只是用 TLS 打了明文端口，即网络链路本来就通。
- 已知限制：HTTP 非 secure context，`crypto.randomUUID()`（`ui-conversation` 加附件路径）与 `JsonTree.tsx` 的 `navigator.clipboard.writeText` 在手机上会失效；`ui-primitives/clipboard.ts` 自身有降级，不受影响。开启 Tailscale HTTPS 后改用 `tailscale serve --bg --https=443 http://127.0.0.1:3080` 可一次性解决（该路径已验证后端可达）。

### 04:30–05:15 · `privilegedAuthority`：让手机也能用被钉在回环的特权方法集

- 现象：手机能打开 GUI、列会话/工作区、正常聊天，但设置面板、凭据、preset 名单、"添加工作区"全不可用。根因在 `packages/client/connection/src/index.ts`：`PRIVILEGED_METHODS`（`host.pickDirectory`/`host.openPath`、`settings.*`、`credentials.*`、`agentPreset.read/copy/remove/openDocument`、`llm.discoverModels`）是**以空信任表**过 `/api` 栅栏的——无论 `trustedHosts` 写了什么，非回环一律 403。实测（curl 直接打 RPC）：手机权威 `100.77.160.68:3081` 下 `settings.describe`/`credentials.describe` → 403，而 `workspace.list`/`session.list` → 200。
- 改动（方案 A，按仓库规范落地）：新增配置 `privilegedAuthority: 'loopback' | 'trusted'`（默认 `'loopback'`，行为逐字不变）；`apply` 解析成 `privilegedHosts`，特权判断由 `isTrustedApiRequest(request, [])` 改为 `isTrustedApiRequest(request, privilegedHosts)`。测试新增「`'trusted'` 下 15 个特权方法可达载体、未声明权威仍 403」；README 中英正文 + Known Limitations、Agent Note 三件套（`.agents/notes/implemented/feature/2026-09-09-privileged-authority-opt-in.*`）、`gen-config-catalog` 与翻译配对记录同步。
- 部署侧：`~/.dsh/profiles/web/cordis.patch.yml` 新增 `connection` 行（重述 `trustedHosts` + `privilegedAuthority: trusted`）。
- 验证（第二实例 3099：新代码 + 打过补丁的 profile）：`settings.describe` 用 `Host: 100.77.160.68:3099` → **200**（同一请求在旧代码/主实例 3080 上是 403）；未声明权威 → 403；`npx vitest run packages/client/connection` 108/108；`verify-config-catalog`、`verify-translation-pairing`（971 对）全绿；`typecheck` 里 `client/connection` 报错 0。
- **坑（记录）**：`!!js` 在 include 的 YAML 方言里是 **scalar** 标签（`vendor/include/src/index.ts` 的 `JsExpr` 声明 `kind: 'scalar'`），因此 `!!js [...]` 会被当成 flow sequence 并报 `unknown tag !<tag:yaml.org,2002:js>`，启动直接失败；必须写成带引号的标量：`!!js "[...ctx.webRuntime.trustedHosts, 'x']"`（求值实现是 `eval` + `with (ctx)`）。热重载失败时旧补丁仍在生效，容易误判"改过了"。
- 并发注意：另一会话在 `rpc.ts`/`rpc-host.ts` 加了路由级的 `isTrustedRequest`（用完整 `trustedHosts`），与本次特权判断不重叠，按要求未改动这两个文件；其新包 `workbench-bytes` 我仅在中文配置目录补了一行条目以保持配对门绿。

### 04:35–05:05 · Phase 4：字节路由与查看器（ADR-4）

- 新 host 包 `packages/workbench/workbench-bytes`：一条 `webServer` 前缀 `/workbench/file?sessionId=&path=`。请求先过**浏览器信任栅栏**——给 `HostConnectionService` 新增公开方法 `isTrustedRequest(request)`（`rpc.ts` 里定义 `TrustedRequestHeaders` 结构类型，`rpc-host.ts` 实现，复用部署的 `trustedHosts`，避免第二个配置项或第二份策略）；再过**工作区栅栏** `fenceSessionPath`（与面板列目录同一个，已从服务里抽到 `workbench/workbench/src/fence.ts` 共享）。之后才 `createReadStream(processPath)`，整文件不读入内存。
- Range 是纯函数 `parseRange(header, size)` → `full`／`partial`／`unsatisfiable`：`206` 带 `content-range`、`416` 带 `bytes */<size>`、`HEAD` 只回头部；畸形、多范围、未知单位按 RFC 9110 忽略并返回完整表示。`/workbench/file` 这个路径常量只有一处（`workbench/workbench/src/protocol.ts`），经 `WorkbenchListing.fileRoute` 报给客户端，客户端不复制字面量。
- **媒体类型只有一个家**：`contentTypeForPath` 与工作台领域同包，`listDir` 给每个文件条目打上 `mediaType`；字节路由用它当 `Content-Type`，查看器链用它路由，浏览器不再从文件名反推类型。
- 查看器是**链式座位**：`workbench` 这条注册在 `workbench.panel` 之外再声明 `workbench.viewer`（chain），`ui-workbench` 为 `image/*`／`audio/*`／`video/*` 各注册一条纯选择器，没有条目认领的类型落到外壳的「无预览」提示。面板通过注入的控制器把文件写进外壳 store 请求预览（**预览选择留在浏览器本地**，只有栏开关与面板选择归 host）；`WorkbenchDirEntry.mediaType` 缺省时回退 `application/octet-stream`。
- 验证：新增 3 个测试文件（range 矩阵、真实 HTTP 路由矩阵、查看器选择器与元素）并补进已有 4 个 spec，`packages/workbench/*` + `packages/client/ui-workbench` 共 10 文件 / 86 测试通过，按新包范围的 per-file 覆盖率四项 100%；`packages/client/connection` 108/108（含新 `isTrustedRequest` 用例）。**组装态抓到真 bug**：`ui-workbench` 原先只 inject `remote`，而浏览器里 namespace 是独立服务 `remote.workbench` 且与其它 entry 并发 apply，启动即报 `cannot get property "remote.workbench" without inject`、整页只显示 "Failed to load plugins"——补上 `remote.workbench` 到 inject 后 `[class*="frame"]` 正常渲染（`data-workbench-collapsed="true"`）。另：`connection` 的 host 面必须引用 `client/connection/tsconfig.host.json`，而 `rpc.ts` 在两个面编译，不能 import `node:http` 类型。
- 回滚：删 bundle 行与包目录，撤掉 tsconfig/catalog/文档登记。

### 05:05–05:35 · Phase 5：插件目录与审批式安装（ADR-7）

- 三个新包，按「能力 seam = Definition／Provider／Consumer」拆：`plugin-catalog`（Definition：`PluginCatalogEntry`／`Query`／`Page` + 抽象 `ctx.pluginCatalog.search/get`）、`plugin-catalog-awesome`（Provider：抓 `awesome-dsh-plugin` 的 CC0 `plugins.json`，一次校验成词表，按 TTL 缓存 + `If-None-Match` 复验，304 就刷新时间戳）、`tool-plugin-catalog`（Consumer：`plugin_search`／`plugin_install`）。
- **发现是数据，不是页面**：没有路由、没有槽位、没有镜像；provider 对非 2xx、不可达、超 `maxBytes`（声明长度与分块两种）、非法 JSON、缺 `plugins` 数组、条目缺字段一律带 code 明确失败，绝不提供残缺索引；`stars`／`downloads` 的 `null` 表示「未知」，工具省略字段而不是打印 0。
- **安装是经审批的 argv**：只接受搜索结果里的 URL → 解析条目 → `parseInstallTarget` 只认 `dsh plugin [--profile <name>] add <target>` 且目标只能是 npm 规格或 `github:owner/repo[#subpath]`（拒绝 `..` 与 shell 元字符）→ `ctx.approval.request({agent, callId, reason, signal})` 只有 `allowed-once` 才继续 → `ctx.subprocess.spawn` 传 argv 数组。**命令文本从不执行，也不由字段拼装**；profile 取自本次构建的模块路径（`$DSH_HOME/profiles/<name>/node_modules/…`），索引无权指定；源码启动推导不出时明确失败并要求 `profile` 配置键。
- 装配：`tsconfig` 三处、`gen-doc-graphs` 的 `SERVICE_ROLES` 加 `pluginCatalog`（seam）、新增子系统页 `docs/subsystems/plugin-catalog.md(.zh)` 并登记 `SERVICE_PAGE`／README／`website/docs.ts`（站点页数 45→46）、`gen-tool-catalog` 挂载登记、`gen-config-catalog`、web-app bundle 加 provider 行（工具按平面规则进 **preset**，不进 host 组合——`shipped-composition.e2e.ts` 断言过全局层工具为空）、`apps/cli` 依赖、`EXPECTED_TOOLS` 加两个工具名；Agent Note 三件套。
- 验证：3 个测试文件 / 32 测试通过、per-file 覆盖率四项 100%（provider 用真实 HTTP server 覆盖搜索/TTL/复验/共享在飞请求/全部拒绝路径；工具用真实注册表 + 真实审批服务 + 记录式目录与进程通道，并钉住目标校验矩阵）。四个生成目录的中英侧已同步并重录配对（975 对全绿）。
- **真索引实盘**：用 provider 直接打 `https://awesome-dsh-plugin.com/plugins.json` → 3,408 条、`search({query:'workbench'})` 55 条、条目字段与 `install` 全部解析通过（与审计快照一致），证明校验器对真实载荷成立。

### 05:35–05:50 · Phase 3–5 收口：门禁、组装态与实机验证

- 提交：Phase 3+4 = `85ebade`、Phase 5 = `c1a687a`、knip 修 = `f38415d`（全部本地、显式路径提交，未含另一会话的连接包文件与日志）。
- 门禁：`doc-sync` **28/28**、`hygiene` 全绿、`lint` 0/0、`typecheck` 两面 0、`test:gui` 283 文件 / 3870 通过；新包按范围覆盖率四项 100%（`packages/workbench/*` + `ui-workbench` 共 10 文件 / 86 测试；目录三包 32 测试）。
- **组装态**：`DSH_SNAPSHOT=replay` web 车道第一遍报 `steering.e2e.ts` 的 `mid-steer` golden 不匹配（问题 composer 比 golden 记录时早一步替换了输入框），**原样重跑即 76 文件 / 255 测试全绿**——判定为既有竞态（测试注释本身就写明「fills 必须落在第一个 replay 窗口内」），非本次回归；已在门禁记录里注明。
- **实机**：重启后的 3080（05:19:48）经 agent-browser 实测——会话头出现 `Workbench` 按钮；开栏后「文件」面板列出会话工作区、可进 `assets/`、显示大小与「Go up」；点 `community-wechat-official-account.png` 由查看器渲染出图片（Phase 4 的 Range 路由 + `workbench.viewer` 端到端可用）。`pluginInventory/list` 显示六个新行全部 `phase=active`。字节路由探针 `/workbench/file?...` 返回 403 且消息为会话围栏文案（已注册而非回退）。
- **踩坑**：客户端可见改动写完必须 `pnpm run build:lib:client`——我只跑了 host 构建，导致 `/plugins/.../ui-workbench/client.js` 仍是旧包（无查看器），浏览器刷新也看不到变化；服务器按请求从磁盘读 bundle 并重算 rev，所以补构建后**无需重启**，刷新即可。另一个坑是空白「New Session」页没有会话头，`Workbench` 开关只在打开会话后出现。
- 架构决策：`community-audit/ARCHITECTURE-DECISIONS.md` 新增「Implementation status」表，逐条 ADR 标注落地包/提交/回滚方式（ADR-5 按用户决定 deferred）；`SYNTHESIS.md` 的 Pending 清空。

### 14:20–14:45 · 提交 `privilegedAuthority`；桌面启动块开机自启加固

- 提交：`06f1e4e feat(client-connection): let a deployment opt the privileged method set into trusted authorities`（显式路径，pre-commit 四钩子全过：翻译配对 / lint / 空白 / vendor manifest）。提交后复跑：`doc-sync` **28/28**、`typecheck` 0、`lint` 0/0、`npx vitest run packages/client/connection` **108/108**。**未 push**。
- 现象：开机后桌面启动块"看不见"。诊断（进程启动时间对比）：开机 `11:56:28` → Explorer 起来（即真正登录）`14:22:52` → 转发器 `14:27:50` → 启动块 `14:28:07`。结论：自启**确实执行了，但比登录晚约 5 分钟**——`shell:startup` 的项由 Explorer 排队，本机 Run 键里已有百度网盘/夸克/360/Edge/QQ/元宝/千问等一堆启动程序把队列挤满。
- 加固：新增 `start-tile.vbs`（隐藏窗口）+ `start-tile.cmd`——先轮询等 Explorer 就绪（最多 3 分钟）→ 再等 4 秒让桌面与壁纸宿主起来 → 才启动启动块，每一步写 `tile-startup.log`。四条自启路径并存，`DshTile.exe` 的互斥量保证不会开出第二个：`HKCU\Environment\UserInitMprLogonScript`（最先，Explorer 之前）、`HKCU\...\Run\DSHWebTile`、`shell:startup\DSH Web tile.lnk`（三条都指向 vbs），以及转发器的 `HKCU\...\Run\DSHWebForward` + `shell:startup\DSH Web forward.lnk`。等待 Explorer 这步同时消除了另一个隐患：桌面没准备好就建窗口，容易落到壁纸下面看不见。
- 两个附带修复：① 转发器曾出现**两个进程**（一个占端口、一个空转不退出）→ `win-tcp-forward.py` 加单实例保护（端口被占就记一行日志并静默退出）并新增 `win-forward.log`（实测 `[14:39:33] listening ('0.0.0.0', 3081) -> 127.0.0.1:3080`）；② `UserInitMprLogonScript` 里直接写 `.vbs` 路径不可靠（userinit 不走文件关联），已改为 `wscript.exe //nologo "…\start-tile.vbs"`。
- 未做（需管理员）：登录触发的计划任务不受 Explorer 排队影响且可配重试——`schtasks /create /tn "DSH Web tile" /tr "C:\Users\29461\Desktop\dsh-web\start-tile.vbs" /sc onlogon /f`；普通权限实测报"拒绝访问"。
- 工具坑：从 WSL 经 interop 调 `Start-Process -RedirectStandardOutput/-RedirectStandardError` 会**挂住不返回**（两次实测都在超时被杀），改用 `pythonw` 无重定向或把日志写进脚本即可。

### 20:05–20:30 · 桌面启动块加第 4 套皮肤（JPEG 白底抠图）

- 新皮肤 `skins/4-box.png`：附件是 JPEG 1086×1381、纯白底 (251,251,251)。`make-skins.py` 的 `SOURCES` 加第四项并新增 `cut_light` 模式——从边框四连通洪水填充亮度 ≥232 的区域置透明 + 1.2px 羽化，背景与雨丝一起去掉，而裙子／袜子／纸箱这些**内部**白色保留；再裁到内容框 + 1.5% 留白 → 1086×1356，比例 0.801。
- 验证：重启后 `skins loaded=4 current=4-box.png aspect=0.801`；`size=961` 时窗口 770×961（宽 = 高 × 比例）。用**物理坐标**截图与「皮肤缩放到窗口」的参考图对比，逐像素一致，右上角换肤箭头与右下角缩放把手都在。
- **排查坑（重要）**：同一台机器上，非 DPI-aware 的 PowerShell 截出来是 1536×960（DIP），DPI-aware 的截出来是 1920×1200（物理）；**对分层窗口（ULW）而言，非 aware 截图的缩放与偏移和窗口矩形对不上**，会让人误判成"渲染偏了/放大了"（我一度以为是 1.25× 缩放 + 偏移）。结论：验证 ULW 窗口必须先用 `SetProcessDPIAware()` 再截图，并按物理矩形裁切。本次也确认当前只有一块 1920×1200@125% 的屏（此前 4096×1440 的虚拟屏是双屏时的尺寸）。
- 中途把 `tile.ini` 覆盖成了旧的位置/尺寸，已按用户当时的取值恢复；诊断用的临时日志行已移除并重建。

### 21:00–21:40 · Phase 6：插件市场面板（ADR-9）

- **安装抽成一份能力**：新包 `packages/workbench/plugin-install`（`@deepseek-ai/dsh-plugin-install`）发布 `ctx.pluginInstall.install(url)`——解析目录条目 → `parseInstallTarget` 校验条目自带目标 → 从本构建模块路径推导 profile → `ctx.subprocess.spawn` 传 argv 数组。`install-target.ts`／`profile.ts` 从 tool 包**移动**到该包，工具包改为「解析条目 → `ctx.approval` → 调能力」。
- **目录获得 Remote 面**：`AwesomePluginCatalog` 改为**直接**继承 `TypertRemoteService`（生成器要求 @Remote 方法所在类直接继承它，抽象中间类不认）并给 `search`/`get` 标 `@Remote`；`plugin-catalog` 保持无传输的契约（`PluginCatalog` 从抽象类改为 interface + Context 键 + 带 code 的错误）。浏览器因此经 host 缓存搜索，而不是自己抓 3 MB 索引。
- **marketplace 面板**：`ui-workbench` 新增 `workbench.panel` 注册（id `marketplace`，order 20）——搜索框、结果行（名称/owner/摘要/分类·star·下载量/安装命令）、**两步确认**（安装 → 确认安装）后调 `pluginInstall.install`。面板只发 URL，**从不接触命令**；人的点击就是同意，agent 路径才额外走 `ctx.approval`——这正是被否掉的社区路由所缺的 `/api` 栅栏语义。
- 装配：`tsconfig` 三处 + `/types` 路径、web-app 加 `plugin-install` host 行、`api/remotes` 挂两个新 remote、`gen-cordis-catalog`/`gen-config-catalog`/`gen-client-catalog`/`gen-doc-graphs`/`gen-tool-catalog` 全部重生成（含中英两侧同步与配对重录，978 对全绿）、ADR-9 + 实现状态表、Agent Note 三件套、根 README 与子系统页更新。
- 验证：`packages/workbench/*` + `ui-workbench` 15 文件 / 132 测试通过、新包范围 per-file 覆盖率四项 100%；`lint` 0/0、`typecheck` 两面 0、`test:gui` 284 文件 / 3879 通过、`hygiene` 全绿、`doc-sync` 28/28。
- **需要重启**：新增了 host 行（组合变化）且目录 provider 多了 Remote 面，运行中的进程不会热加载。

### 21:40–22:10 · Phase 7：壁纸面板（ADR-10）

- **背景是一条声明的框架座位**：`ui-layout` 新增 `shell.background` 列表槽位——全幅、可穿透点击、渲染在栏位之前的一层，栏位被抬到它之上（`.backgroundLayer` + 各栏 `position:relative; z-index:1`）。`shell.overlay` 不能用（它按设计画在所有栏位之上）；主题 token 也不能用（目录类型是 `CSS color` 且带校验）。
- **壁纸 = 面板 + 那一条条目**：`ui-workbench` 注册 `wallpaper` 面板（order 30，经**同一道受围栏保护的列举**列出会话工作区的图片）与一条 `shell.background` 条目（图片 + 遮罩）。选择存在插件持有的快照 store 里，经 `ctx.wallpaper` 暴露；面板写、背景条目经 inject `hooks` 隔间读，两个注册互不伸手。
- 选择是**浏览器本地**并持久化在带命名空间的键下；会话已消失的 URL 加载失败时图层自行隐藏（不留坏背景）。不进入 host、agent 与会话日志——「喜欢哪张图」不是会话状态。
- 验证：`ui-workbench` 9 文件 / 71 测试、`ui-layout` + `ui-workbench` + workbench 包共 23 文件 / 213 测试通过，`ui-workbench` 范围 per-file 覆盖率四项 100%；`lint` 0/0、`typecheck` 两面 0、`gen-client-catalog` 重生成；ADR-10 + 实现状态表 + Agent Note 三件套 + 子系统页与根 README 中英更新。

### 22:00–22:30 · 启动阻塞修复（codex）+ 可靠性门禁（ADR-11）

- **codex 修的两个启动阻塞**（工作树里，已并入本次提交）：
  1. `plugin-catalog-awesome` / `plugin-install` 的**生成 Remote 代码依赖 zod，但两个包都没声明它**——bundler 于是把它留成外部 `require("zod")`，而浏览器模块表只有 seed/static/已注册 bundle 三种来源，插件页直接进 "Failed to load plugins"（服务端还活着，所以重启也不修）。补 `zod` 依赖后 bundler 内联，产物里不再有该外部引用。
  2. **Remote 方法名与客户端 namespace 服务自己的成员重名**：`@Remote('install')` 撞上 `RemoteNamespaceService.prototype.install`（私有方法也在 prototype 上），挂载被拒。改名为 `installPlugin` 并同步面板调用；Host 语义不变。
- **新增门禁 1：`pnpm run verify-client-bundles`（已接进 `pnpm run build`）**——构建后逐个执行 41 个客户端 bundle 的注册信封（vm 里跑顶层 `__ModuleLoader__.load`，不执行 factory），断言：只注册一次且 id 等于包名；每个字面量 `require("<spec>")` 必须是平台 seed 词、shell static 或已注册的插件 bundle（允许 `/client` 后缀）；**每条 `dsh.client.inject` 图边也必须落在模块表里**（后者当场抓出 `ui-workbench` 里两条指向 host-only 包的边——`plugin-catalog-awesome` / `plugin-install` 没有客户端 bundle，客户端图没有这行可等；真正提供服务的 `api-remotes` 早就在列表里，已删除）。zod 那类「未声明依赖被外置」会在这里当场失败，不必等到重启看页面。附带 `scripts/verify-client-bundles.spec.ts` 用合成 bundle 证明五条拒绝路径（未知外部、图边无对应行、id 不符、信封抛错、零注册）。
- **新增门禁 2：生成器静态拒绝保留名**——typert 生成器在解析 `@Remote` 时对**显式名与裸方法名**都做检查并给出教学式报错（建议改成 `installPlugin`）；两个 fixture 测试分别覆盖两种形态。运行权威仍是 gateway：它在 namespace 挂载时按该服务自身的 prototype 与实例成员拒绝重名。
- **门禁 2 踩的两个坑（值得记住）**：① 最初让分析器 import 一个新增的共享常量，`build:lib:host` 当场炸——`tsdown.config.ts` 从**已构建的** `packages/typert/generator/lib/types/tsdown-plugin.js` 加载生成器，它再 import 那个包的**已构建** `lib/index.js`，而那份产物正是本次构建要产出的东西；新导出在旧产物里不存在，构建死在自举上。② 改成让 gateway 客户端 import 该常量后，`test:web` 里的**客户端 bundle 纯净门禁**把它拦下：客户端 bundle 不允许对另一个插件的模块做值导入。结论：**保留名清单只能由分析器自持**（host 面生成器不能 import client 面模块，也不能 import 自己正在产出的产物），gateway 的挂载期检查保持原样即运行权威。
- 验证：`verify-client-bundles` 41/41 通过、`scripts/verify-client-bundles.spec.ts` 7 测试、`remote-model.spec.ts` 40 测试、`build:lib:host` 与 `build:lib:client` 均绿、`typecheck` 两面 0、`lint` 0/0。

### 22:30–23:05 · 壁纸面板目录导航；壁纸真的能看见了

- **面板可进目录**：`wallpaper` 面板原来只列工作区根目录（本仓库图片都在 `assets/`，所以打开就是空态）。现在与文件面板共用新内部模块 `listing.ts` 的两个纯函数——`parentPath(path, root)`（按 host 分隔符裁一层，越界夹回 root）与 `selectWallpaperEntries(entries)`（分目录/图片）——面板列出子目录与图片，可进入、可「返回上级」，空态文案改为「这个目录里没有图片」。
- **顺手修掉文件面板的一个小错**：「返回上级」原来一律跳回根目录（`setPath(listing.root)`），从 `assets/foo/` 按它并不「向上」。两个面板现在都走同一个 `parentPath`，`file-panel.client.spec.tsx` 增加了一个两层的用例（`/w/src/deep` → `/w/src`）。
- **发现并修掉壁纸「设了却看不见」**：实机测量（隐藏图层前后逐像素对比）显示只有 0.17% 的像素变化——`ui-conversation` 的根节点自己画了 `--dsw-alias-bg-base`（白色），把框架里的 `shell.background` 图层整个盖住了；框架本身已经画了同一个底色，所以会话列根节点的那行背景是多余的。删掉后（无壁纸时像素完全不变），换一张彩色探针图实测：会话区均值 R 从 249.8 降到 222.0，壁纸在遮罩下清晰可见且文字仍可读。
- **一个自己造出来的回归（重要）**：`DSH_SNAPSHOT=replay pnpm run test:web` 报 **36 个失败**（`settings-chrome`、`models-settings`、`agent-preset-authoring`、`plugin-config`、两份 onboarding、`cordis-tool-round`），全部是 30s 点击超时，报错都指向「`_6_0dBa_scrollBody` 拦截了指针事件」。根因是 Phase 7 给四条栏位加了 `position: relative; z-index: 1`——设置模态框注册在 `sidebar.settings`（侧栏子树里，`position: fixed; z-index: 1000`），栏位一建立堆叠上下文就把它永久压在后面的会话列之下，z-index 再大也出不来。修法是**只删四条 `z-index: 1`**：背景图层本来就在文档顺序上排在栏位之前，栏位自然盖住它、透明处露出它，模态框则重新回到框架的堆叠上下文里。单独跑 `settings-chrome.e2e.ts` 从 6 失败变为 **8/8 通过**。
- 验证：`ui-workbench` + `ui-conversation` 38 文件 / 510 测试、`ui-workbench` 范围 per-file 覆盖率含新文件 `listing.ts` 100%、`test:gui` 287 文件 / 3902 通过、`lint` 0/0、`verify-client-bundles` 41/41、`doc-sync` 28/28；实机在 3080 上点进 `assets/` 设置图片并截图确认（彩色探针图：会话区均值 R 249.8 → 219.6，侧栏保持自己的表面色）。

## 2026-09-10

### 00:20–00:40 · 市场装不了 monorepo 皮肤：放宽 `#path:` 片段；装了两套社区皮肤

- **用户实测报错**：在插件市场点安装 `dsh-deep-whale#maid-atelier`（⭐1974）失败——`install target "github:Small-tailqwq/dsh-deep-whale#path:/maid-atelier" is neither an npm specifier nor a github:owner/repo reference`。`parseInstallTarget` 的 `GITHUB_SPEC` 只认 `#<commit-ish>`，不认 pnpm 的 monorepo 子目录片段。
- **按证据放宽**：抓了 CC0 索引全量统计（3408 条，`install` 命令 100% 匹配 `dsh plugin [--profile <name>] add <target>`）：npm 1792、`github:owner/repo` 1476、**`#path:/<子路径>` 140**、`#semver:` 0、git/http/别名 0。所以只加 `#path:` 这一种形态（可带或不带前导 `/`），其余不放宽；`..`、空片段、shell 元字符照旧拒绝，报错文案改成点明可接受形态。`plugin-install` 测试 10 个（新增 2 个接受 + 5 个拒绝用例）。
- **顺手把新门禁用在真实第三方包上**：装完先用 `verify-client-bundles` 的同一套逻辑（vm 里执行注册信封 + 比对模块表 + `dsh.client.inject` 边）预检。
  - `@dsh-external/dsh-client-ui-skin-maid-atelier`：OK（7.2 MB bundle，只 require 表内词，inject 为空）。
  - `@kubor/dsh-bloom-theme`：OK（OKLCH 莫兰迪四变体，纯 token，无 peer 依赖）。
  - `dsh-dream-skin`：**拒绝**——它的 bundle 在 `load({...})` 之外还留了一个顶层 IIFE，执行时立刻 `document.createElement("style")`、扫 `[role="dialog"] nav button` 并在 `document.body` 上挂 `MutationObserver`；这违反「执行 bundle 只注册 factory」，且不属于任何 fiber、无法随 dispose 回收。已装又卸载（`dsh plugin --profile web remove dsh-dream-skin`），要装回来一条命令即可。
- 现状：`~/.dsh/profiles/web/package.json` 的 bundles 追加了 `@dsh-external/dsh-client-ui-skin-maid-atelier` 与 `@kubor/dsh-bloom-theme`；`dsh --profile web --dump-config` 组合成功（两行落在末尾）；**需要重启进程才会生效**，且市场面板里的 `#path:` 目标也要等重启后才会被新的校验器接受。

### 15:38 · 记录阶段性开发 spec、启动故障核查与外观插件审查

- **开发计划已保存**：[阶段性开发计划 Spec v0.1](进化/阶段性开发计划.spec.md)。依据进化日志、灵感及两版架构材料，划分 E0 访问基线 → E1 移动 Web/PWA → E2 内容接入（交付 A）→ E3 最小设备协议 → E4 薄 Android 能力（交付 B）→ E5 多节点/物理能力评估。已区分现有工作台与 PWA manifest、待补移动体验、浏览器本地偏好及服务端共享状态；包含依赖、验收、代码入口和初始工期估算，功能尚未实施。编写 spec 时 `pnpm run doc-sync` 为 28 通过、0 失败，32 个本地引用及格式检查通过；lint 的首轮因沙箱 IPC 限制失败，宿主重试最终结果未取得，不记为通过。
- **启动故障与恢复**：用户报告 `web boot: 36 entries did not activate`，多个插件等待 `slots`、`connection`、`typert`、`remote` 等基础服务。核查时宿主 `127.0.0.1:3080` 返回 HTTP 200；独立浏览器能加载会话列表和输入框，连续三次重新打开均未出现失败页面。用户随后确认刷新已恢复。本次未重启服务、未修改启动代码，根因尚未确定，不能把恢复归因于某项修复，也不能认定由皮肤或构建造成。
- **验证范围**：`node --import tsx/esm scripts/verify-client-bundles.ts` 检查仓库内 41 个 bundle 通过；这不等于第三方插件生命周期合规。独立浏览器访问 Tailscale `:3081` 入口发生 CDP 导航超时，未完成该入口验证，不能据此判断远程服务失效。检查结束已关闭本次创建的浏览器会话。
- **壁纸与女仆皮肤职责冲突**：内置壁纸注册在 `shell.background`；安装的 `@dsh-external/dsh-client-ui-skin-maid-atelier@0.0.1` 在会话列内另建带完整背景的 `character-stage`，未通过同一背景选择机制协调。源码与实页层级显示该背景可覆盖框架底层壁纸。皮肤还把 `--dsw-alias-bg-base` 设为 `transparent`（实页 computed style 已确认），而[壁纸遮罩](packages/client/ui-workbench/src/client/WallpaperPanel.module.css)正使用该变量，原本的可读性遮罩因此失去颜色。
- **更正“Bloom 纯 token”判断**：安装的 `@kubor/dsh-bloom-theme@0.9.0` 不只提供配色。其 `src/client.ts` 顶层 IIFE 注入 CSS/控件、挂观察器并检查更新；localhost/127.0.0.1 下每 3 秒 GET 自己的脚本，内容变化后调用 `location.reload()`，实页已观察到连续轮询。`src/dom.ts` 还扫描并标记 `<think>` 文本。定时器、全局观察器等没有对应 Cordis effect disposer，存在卸载残留；本次未执行卸载实验。前次预检的“OK”不能作为纯主题或可安全热卸载的结论。
- **内置壁纸的状态问题（源码审查）**：[WallpaperPanel](packages/client/ui-workbench/src/client/WallpaperPanel.tsx)将壁纸 URL 绑定 `sessionId + path`，会话删除或文件移动会使背景失效；选择保存在浏览器 localStorage，不会自动同步到手机。面板切换会话时没有重置目录与旧列表，可能用旧工作区路径访问新会话；列目录失败后直接返回错误视图，清除/返回入口也不可见。[WallpaperBackground](packages/client/ui-workbench/src/client/WallpaperBackground.tsx)记住失败 URL，同一 URL 在组件存活期间持续隐藏，缺少重试恢复。这些问题尚未新增回归测试或修复。
- **后续建议，尚未实施**：主题负责颜色，皮肤负责装饰，壁纸服务统一管理背景；用户自选壁纸优先于皮肤默认背景。先处理 Bloom 的自动刷新与资源清理，再修壁纸目录/失败恢复，随后统一外观设置和背景优先级。本次只做审查，没有卸载第三方插件或修改其源码。

### 15:40–16:10 · 三条体验反馈的落地

- **① 文件没有可用预览 → 补文本查看器 + 放宽类型表**。根因有两层：`workbench.viewer` 链只有 image/audio/video 三个选择器，且 host 的 `contentTypeForPath` 只认 24 个扩展名，`.ts`/`.yml`/`.log` 之类全落成 `application/octet-stream`（连"文本"都不算）。新增 `TextViewer`（选 `text/*` 与 `application/json`，`fetch` 字节路由后渲染 `<pre>`，超 `TEXT_PREVIEW_LIMIT=200000` 字符截断并提示，卸载即 abort）并把类型表扩到代码/配置/标记语言等 60+ 扩展名——**全部映射到非可执行类型**（`.html` 是 `text/plain`，不是 `text/html`，字节路由按表发 `Content-Type`）。实机验证：点 `AGENTS.md` 渲染出 15987 字符。
- **② 市场**：打开即列默认页（原来必须点搜索）、按 star 排序、按阅读者语言显示摘要。provider 的 `search` 在无关键词时按 star → 下载量 → 名称排序（索引原序是生成顺序，不是热度）；面板挂载时自动拉取一页；`ui-workbench` 注册把 `ctx.locale` 作为 inject `hooks` 交给面板，面板按 `active` 选 `descriptionZh`（浏览器是英文时显示英文，这是设计）。安装失败里 `#path:` 那类已在 00:20 条目修掉。
- **③ 壁纸面板去掉，只留主题**：用户反馈"在文件夹里选图片当背景没啥用，还不如主题"。删掉 `WallpaperPanel`/`WallpaperBackground`/`wallpaper.ts` 与其两个 spec、面板与 `shell.background` 条目、`ctx.wallpaper` 服务、`shell.background` 座位（ui-layout 的 SlotMap/AppFrame/CSS）、`selectWallpaperEntries`、本地化键、README/子系统页的段落与该特性的 Agent Note 三件套（历史留在本日志）。会话列根节点恢复自己的底色（座位没了，那层透明就没意义了）。工作台现在只有「文件」「插件市场」两个面板。
- 验证：`ui-workbench`（含新 `TextViewer`）per-file 覆盖率 100%、`packages/workbench` + `ui-workbench` + `ui-layout` + `ui-conversation` 51 文件 / 651 测试、`test:gui` 286 文件 / 3899 通过（`ui-primitives` 的 code-block 懒加载用例单独跑通过，属既有 flake）、`lint` 0/0、`doc-sync` 28/28、`verify-client-bundles` 41/41；实机确认壁纸页消失、文本预览可用、市场无需搜索即出结果。

### 16:10–16:35 · 工作台「主题」面板（GUI 切换，含恢复默认）

- **新面板 `theme`（order 30，接替原来的壁纸位）**：列出 `ctx.theme` 注册表里的全部主题 + `默认（跟随系统）`，当前项标「当前」，其余给「应用」按钮；应用走的是 `ctx.theme.setTheme`——与设置里「外观」行同一个偏好、同一个 owner，不做第二份状态。
- **接线细节**：`ThemeRuntime` 只有 `getTheme()` 与 `theme/change` 事件，**不是** bare observable，所以插件在 `apply` 里用一个 `SnapshotStore` 承接（初值 `getTheme()` + 订阅事件），再把它作为 inject `hooks` 交给面板（面板侧 `useTheme`）；`ui-workbench` 的 inject 增加 `theme`。面板的 inject 面显式标注类型，否则注册处推断出来的 face 不带 `hooks`。
- **实机**：刷新后工作台是「文件 / 插件市场 / 主题」；主题页当前显示 `Default (follow system)` / `light` / `dark`（dark 为当前）。**社区皮肤没有登记进原生注册表**——bloom 走 `body[data-bloom-variant]`、女仆皮走 `data-dsh-maid-atelier`，所以它们不在这张表里（要用它们自己的设置入口切）；我的面板对"愿意用原生注册表的主题"自动生效。
- **顺带确认「极光」来源**：是 **bloom-theme 的 `aurora` 变体**——`body[data-bloom-variant="aurora"]::before` 上两条斜向渐变丝带 + 60px blur + 28s 漂移动画（`z-index:-1`，画在应用内容之下）。当前 body 是 `data-bloom-variant="mist"`，所以要把变体切到 aurora 才会看到；不想要就卸掉 bloom 或换成别的变体。
- 验证：`ui-workbench` 81 测试（含新 `ThemePanel` 4 个）与 per-file 覆盖率 100%、`typecheck` 两面 0、`verify-client-bundles` 41/41；实机截图确认三栏与主题页。

### 16:40–17:20 · 皮肤开关（profile 行级）＋系统原皮命名

- **背景**：社区的主题/皮肤**都不走框架原生主题注册表**——`dsh-theme` 靠 123 处 `data-dsh-*`、女仆皮靠 `data-dsh-maid-atelier`（实测把属性删掉也不关）、`@eternalnight/dsh-theme` 走 `overrideTokens`。所以"整合"只能落在两处：原生注册表（即时切换）与 **profile 行开关（重启生效）**。
- **皮肤开关（host 能力）**：`@deepseek-ai/dsh-plugin-install` 新增 `skins.ts`（读 profile 的 bundle 清单 → 解析每个外观 bundle 的 `cordis.patch.yml` 里 insert 的行 id；再按 profile patch 里是否存在 `- id: <row>
  disabled: true` 判断启用状态）与两个 Remote：`listSkins`、`setSkinEnabled`。切换=重写 `~/.dsh/profiles/web/cordis.patch.yml`（停用写 disabled 块，启用删掉该块，回到 bundle 原样）；未知行给带 code 的拒绝。文件算术 21 个测试含 per-file 覆盖率 100%。
- **面板**：主题页改名「外观」性质——上面是 **系统原皮·跟随系统 / 系统原皮·亮色 / 系统原皮·暗色** + 注册表里的社区主题（即时切换），下面是**皮肤**分组：列出已安装的外观行，一行一个启用/停用按钮，写明「重启后生效」。
- **本次 profile 变动**：删 `@kubor/dsh-bloom-theme`（用户：没 UI 效果），装 `dsh-theme`（30 款 CSS 主题）与 `@eternalnight/dsh-theme`。**必须重启**：删 bloom 后运行中的进程仍按旧组合要它的 bundle，浏览器现在报 `Failed to load plugins`（profile 与运行进程漂移，不是代码问题）。重启前已验证：`--dump-config` 组合通过；两个新 bundle 过模块表检查 OK（`dsh-theme` 的 `dsh.client.inject` 写了服务名 `slots`，是信息性错误，不影响加载）。

### 17:15–17:35 · 社区主题的 Apply 点不到：栏位层叠契约再修一格

- **现象**（用户）：@eternalnight/dsh-theme 的主题面板里「Apply」点不动，"被对话框挡住了"。
- **诊断**：面板是 `div.dt-overlay`（`position: fixed; z-index: 200050`），它注册在**侧栏子树**里（和设置模态框同一位置）。女仆皮自己的样式表给侧栏内容根 `_1WWqza_root` 设了 `z-index: 2`——栏位内容因此成了堆叠上下文，把 200050 关在里面；会话列的 composer seat 是 `sticky; z-index: 7`，7 > 2，于是整块对话框被输入框压住（`elementFromPoint` 命中的是 composer 的 textarea）。实测把该根节点的 z-index 改回 auto，Apply 立刻可点。
- **修法（在框架里，不在第三方 CSS 里打架）**：非侧栏的三条栏位（会话/工作台/详情）各自取 `position: relative; z-index: 0` 的堆叠上下文，把栏位内部的 z-index（composer seat 7、下拉 20/100、轨迹表 3-6）**封顶在 0**；侧栏自身不带 z-index，于是任何抬高侧栏内容根的东西（皮肤设 2、设置模态框自身 1000）都能压过会话列，注册在侧栏里的对话框重新可点。契约写进 `AppFrame.module.css` 的注释：栏位之间只有文档顺序，栏位的 z-index 归框架所有。
- **实机验证**：主题面板 Apply `hittable: true`（命中 `dt-btn primary`）、设置模态框第一个导航项 `hittable: true`；女仆皮外观不变。

### 17:45–18:10 · E0：HTTPS 入口打通；部署与验收记录成文

接上一轮（用户在同一天开启了 Tailscale 账户的 Serve/HTTPS）。本轮把 E0 从"只有 HTTP 入口"推到"HTTPS 入口已用真实 Chromium 验证"，并留下可重复的检查工具与记录。

- **HTTPS 入口已生效**：`tailscale serve status` 同时有 `https://node.tail0d75db.ts.net`（443，tailnet only）与旧的 `http://…:3082`，都 proxy 到 `127.0.0.1:3080`。TLS 实测 `TLSv1.3` / `ALPN h2` / 证书 `CN=node.tail0d75db.ts.net`、Let's Encrypt `YE2`、有效期到 2026-12-09——公开受信，Android Chrome 不需要额外信任配置，tailscaled 自持续期。
- **真实 Chromium 验证通过**：Windows Edge 152（`--headless=new --no-proxy-server --dump-dom`）打开该 origin 返回完整启动页（含 `window.__DSH_BOOT__`）。**这是本轮最重要的更正**：先前几轮"Chromium 连不上 Tailscale 入口"的结论是错的。
- **两条假故障线索，已定位并记入部署文档**：① WSL 在 mirrored 网络下同时持有 `100.77.160.68/32`，于是 WSL 内该地址被当成**本机地址**（`ip route get` → `dev lo`），WSL 里连 `:443`/`:3082` 一律 connection refused——**WSL 够不到不等于服务不可用**，HTTPS 探测必须在 Windows 侧跑。② WSL 的 `HTTP(S)_PROXY` 指向 Clash（`127.0.0.1:7897`）且 `no_proxy` 不含 `100.*`，tailnet 请求被丢给代理后返回 **502 + `Proxy-Connection`**，看起来像后端挂了。上一轮用 `agent-browser` 拿到的"Chromium 失败"就是这两条叠加：它默认驱动的是 **WSL 自带 Chromium**，`connect 9222` / `--cdp 9222` 都没有真正接管 Windows Edge（`get cdp-url` 返回自己新起的实例，UA 为 `X11; Linux x86_64`）。
- **可重复检查**：`进化/e0_smoke.py`（只读、直连、验证 TLS、不落盘响应体）与 `进化/test_e0_smoke.py`（6 用例）本会话首次实测——HTTPS origin 13/13 通过（`E0-HTTPS检查结果.json`，`require_https: true`），回归 6/6 通过。`--privileged-status` 用来钉住特权策略位：本轮传 `200`，即当前部署确实启用了 `privilegedAuthority: trusted`。
- **部署事实记录**：新增 `进化/移动访问部署与验收.md`（计划第 4 节点名的交付物），含监听位置、origin、authority 与特权策略、启动/停止/恢复、TLS 事实、探测矩阵、未完成项与四条陷阱。
- **确认漂移已消除**：`GET /` 的 `window.__DSH_BOOT__` 44 个条目里没有 bloom，`/plugins/@kubor/dsh-bloom-theme/client.js` → 404。17:44 那次重启确实把 profile 与进程对齐了（重启清单第 1、2 项通过）。
- **手机真机验收通过**（18:1x）：手机 `v2463a` 转为 **active**，经**东京 DERP 中继**（非局域网直连、链路约 37 MB）打开 `https://node.tail0d75db.ts.net/`，五项全过——进入已有会话看历史、发消息看流式、点审批、工作台打开文件预览，并且工作台开关与 PC 同步（这是 `workbench` 服务进程级 `open/active` 的既定设计，不是远控）。
- **首次加载被误判为卡死（新发现）**：手机在 `Loading plugins…` 停留较久。实测首屏载荷 **11.70 MiB / 48 个请求**，其中 **7.0 MiB（60%）是单个第三方 bundle** `@dsh-external/dsh-client-ui-skin-maid-atelier`；且服务端**不压缩**（客户端给 `Accept-Encoding: gzip, br`，响应无 `Content-Encoding`）。经 DERP 的移动网络下这就是原因，不是故障。E1 候选优化：host 侧压缩、或把皮肤拆出首屏。
- **E1 缺口已用代码证据定位（下一步要做的事）**：`computeColumns(390, 56, 560, 0)` 走完让步链后把工作台推导为 **0 宽**（56 轨 + `CENTER_MIN` 640 + `WORKBENCH_MIN` 320 已超过视口），而 `WorkbenchShell` 在 `collapsed` 时直接 `return null`。所以窄屏下点「工作台」只写了 host 共享状态（PC 那边开），**手机上什么都看不到**——这正是计划 §5 要修的「求解器把工作台宽度归零后让按钮失去作用」。已在 `AppFrame` 落地「窄屏单面板呈现」的改法（只改呈现、不写共享状态），测试与文档未完成，故未随本次提交。
- **仍未完成**：手机「断开重连后读回最终结果」与「停止 PC 后明确显示不可达」未实测——后者要停服务、会中断正在使用的 GUI 会话，须用户指定时机；「非家庭 Wi-Fi」由中继路径间接支持、待用户确认网络类型。旧链路（`0.0.0.0:3081` 转发、`:3082` HTTP Serve）按计划在真机验收通过后再收敛。

### 18:20– · 桌面启动块显示 DeepSeek 账户余额（用户新需求）

用户要求：桌面启动块（`DshTile.exe`）实时显示 DeepSeek 账户余额，并且**余额对 agent 可见**（agent 也要能读到）。实现顺序排在 E1 之前。余额来源与鉴权方式见本轮后续条目。

### 21:35–21:50 · 桌面启动块实时显示 DeepSeek 余额（agent 读同一份快照）

用户需求：启动块显示账户余额，**并且余额对 agent 可见**。顺序上排在 E1 之前。

- **数据来源**：DeepSeek 官方 `GET https://api.deepseek.com/user/balance`（[API 文档](https://api-docs.deepseek.com/api/get-user-balance/)），返回 `balance_infos[]`（currency / total_balance / granted / topped_up）。密钥只存在于 WSL（`~/.bashrc` 的 `DEEPSEEK_API_KEY`），Windows 侧没有——所以**发请求的必须是 WSL 那一侧**。
- **一个抓取者、一份快照、两个读者**：新增 `进化/fetch_balance.py`（只读接口 + 原子写快照：临时文件 + `os.replace`）与 `进化/test_fetch_balance.py`（8 用例：货币选择、非 JSON、缺 `balance_infos`、失败时**保留旧快照**、密钥解析回退、Bearer 头、密钥绝不回显）。启动块用 `wsl.exe -- python3 <仓库路径>/进化/fetch_balance.py --out <盘符转 WSL 的路径>` 调用它，脚本把快照写成本目录的 `balance.json`，启动块再**读同一个文件**画牌子——所以屏幕上那个数字和 agent 读到的字节完全一致。
- **余额对 agent 可见的路径**：`/mnt/c/Users/29461/Desktop/dsh-web/balance.json`（= WSL 视角）。本轮实测读到 `CNY 15.59`。这是 16:00 那条"可见"约定的落地位置，后续会话直接读这个文件即可，不必再抓接口。
- **失败语义**：抓取失败**不覆盖**旧快照，牌子改成琥珀色并显示年龄（"5 分钟前"）；没有快照时显示"余额不可用"。图标区太小（<150px）不画牌子，免得不清楚。
- **改动落点**：`DshTile.cs`（新增 `BalanceWatcher` 后台线程 + `DrawBalance` 气泡绘制 + 右键菜单「余额：¥xx（点此刷新）」「显示余额」开关 + `tile.ini` 的 `balance` / `balanceseconds` / `balancescript`），用 `csc` 直接编译（无新依赖，只多了一个 `using System.Diagnostics;`）；`README.md` 增加「账户余额」一节。**DshTile.cs/README.md 不在仓库里**（桌面部署目录），改动不回仓库。
- **气泡样式**：第一版是我手画的深色小牌子，用户反馈丑，改为**用户提供的云朵素材**（`bubble-source.jpg`，1920×640，黑底 JPEG）——`make-bubble.py` 把它抠成透明 PNG：亮度做辉光渐变，但「余额：」是深色字，纯亮度抠图会把字一起抠掉，所以另用**膨胀过的亮度包络**把云体内部整体标为不透明，辉光区再按亮度衰减并做 un-premultiply（否则深色光晕叠在壁纸上是黑边）。量出的标签几何写进代码注释：冒号右端在 35.5% 宽、字形垂直中心 54.5%、字高 22.5% 高——数字就画在「余额：」后面，字色取标签本身的 `#44576F`。左键点气泡（不拖动）= 立刻刷新，拖动仍然是移动启动块。
- **验证**：`tile.log` 出现 `[balance] CNY 15.32`；`PrintWindow` 抓到窗口位图，气泡显示「余额：¥15.32」，云朵边缘透明、无黑底方块。

### 22:00–22:30 · E1 第一步：窄屏单面板工作台（`ff620ce`）

- **问题确认**：断点以下让步链容不下会话栏与工作台栏并存（侧栏轨道 56 + `CENTER_MIN` 640 + `WORKBENCH_MIN` 320 > 视口），求解器把工作台推导成 0 宽、`WorkbenchShell` 直接 `return null`。于是窄屏上点「工作台」**只提交了 host 共享状态**（PC 那边打开），这个客户端上什么都看不到。
- **改法**：断点以下、且工作台偏好为打开时，外壳降为两条轨道，把工作台作为**单面板**占满侧栏旁的轨道；会话栏以 `display:none` 保持挂载（会话状态不丢），返回会话用外壳自己的关闭按钮。**只读共享偏好、从不写它**——视口变化（旋转、缩放）不会打开/关闭/改选另一端正在显示的工作台；只有人的手势才提交，且仍走 host 服务。没有新增断点，沿用既有的 `SIDEBAR_AUTO_COLLAPSE`。
- **被否决的方案**（写进 Agent Note `2026-09-10-narrow-single-panel-workbench`）：让求解器给工作台最小宽度、把会话栏压到下限以下；把工作台叠加在会话栏上；窄屏时自动关闭工作台（用本地视口变化写共享状态）。
- **验证**：`packages/client/ui-layout` 73 测试通过（含 6 个新用例：单面板呈现、关闭后回四栏、缩放不写偏好、变宽恢复共享宽度、不出现拖动手柄）；`test:gui` 287 文件 / 3912 通过；实机 390 CSS px 下打开工作台，实测 `data-single-panel=true`、轨道 `56px 334px`、会话列 `display:none`、工作台显示；随后点关闭恢复原状（原本就是关闭的）。
- **未做（下一轮）**：计划 §5 点名的组装场景 `apps/web/tests/mobile-workbench.e2e.ts`；PWA manifest/安装测试扩展；断线重连提示与草稿保留；首屏载荷优化（11.7 MiB、无压缩）。

### 23:00–23:35 · E1 第二步：连接断开横幅（`bc35b20`）

- **问题**：断线原本**完全不可见**。`ConnectionController` 只把 `reconnecting` 报告给唯一可启动流循环的消费者，而 runtime 有意静默丢掉该代的作用域交互状态、下次握手后重建——中继后面接入的手机上，症状就是"应用卡死"，输入框里还留着没发出去的草稿。而且这个相位对外根本读不到：`start()` 对第二个消费者直接抛错，`hostDescription` 断线时只撤回、不说明状态。
- **改法**：① connection 插件把本来就算出来的相位发布为 `ConnectionHandle.connectionState`（由同一个喂 sink 的 `onStateChange` 更新，循环停止时清空；循环未启动时"不存在"，不对连通性作断言）。② 新增最小客户端插件 `@deepseek-ai/dsh-client-ui-connection-status`，把相位渲染进 ui-layout 的 **`shell.overlay`**（横跨框架的增量座位，此前无消费者）：连接正常什么都不渲染，断开时一行 `status` 实时区域。**只做呈现**——重连不重发消息、不重新批准、不安装插件，需要丢弃/重建的状态仍归 runtime 所有。
- **被否决的方案**（写进 Agent Note `2026-09-10-connection-phase-banner`）：让横幅自己 `start()`；并进 ui-layout；用失败的 RPC 或停滞的流去推断断线。
- **验证**：新包 8 测试（overlay 注册 + fiber 拆除的 HMR 安全、两侧字典与撤回、node 半边、invariant 配套、三种相位渲染）；`test:gui` 288 文件 / 3920 通过；`verify-client-bundles` **42** 个 bundle；`--dump-config` 组合自检确认 `ui-connection-status` 行已在 web profile 里，**profile 软链已顺带修复**（这一步需要写 `~/.dsh/profiles`，沙箱外）。
- **注意**：新增插件行属于 profile 组合，**要重启 `dsh web` 才会出现**（客户端 bundle 热重载不够）。重启前的两项自检已跑过，可以直接重启。

### 23:35–00:10 · E1 第三步：首屏 gzip（`ce300ae` + `fce8774`）

- **实测**：对运行中的服务量首屏载荷——**11.68 MiB / 48 个请求，全部未压缩**；其中 **7.09 MiB 是女仆皮那一个 bundle**（`@dsh-external/dsh-client-ui-skin-maid-atelier`）。手机经东京 DERP 中继时，"Loading plugins" 卡很久就是这个原因。
- **改法**：`dsh-host-webserver` 导出两条「发实体」路由共用的编码器——`sendEncoded(req,res,status,body,headers)` 在客户端接受、类型是文本、实体超过 1024 字节时 gzip，否则原样发送；`selectEncoding` 是背后的纯决策函数。`dsh-host-frontend-static`（SPA dist）与 `client/modules`（`/plugins/<id>/client.js` 及其 sourcemap）改用它。**只做 gzip**：brotli 只再多省约十分之一，但每次请求要多花几倍 CPU，而这两条路由还没有"预压缩体"缓存层。所有被覆盖的响应都带 `vary: accept-encoding`（**包括原样发送的**），否则共享缓存可能把压缩体交给没要求压缩的客户端。
- **收益**：同一份载荷 **11.68 MiB → 6.25 MiB（少 47%）**。剩下的主要是女仆皮（7.09 → 5.26 MiB，大头是内联图片数据，压不动）——**把它移出首屏是比压缩更大的收益**（去掉它之后剩余部分约 1 MiB），列为下一项。
- **验证**：`webserver` 6 个新单元用例（gzip 解码回原文、`q=0` 拒绝、`*` 通配、小实体不压、非文本不压且不声明 vary）；`frontend-static` 真实 HTTP 端到端（raw socket 观测 `content-encoding: gzip` + `vary` + gunzip 还原、identity 原样）；`test:gui` 289 文件 / 3928 通过；host 侧 36 文件 / 497 通过；lint 0。typecheck 曾报一处（`MIME['.html']` 可能是 `undefined`），已改成 `HTML_TYPE` 常量一处归属。
- **注意**：同样**要重启 `dsh web` 才生效**（host 代码）。与连接横幅那一条是同一次重启。

### 00:15– · 重启核对、bundle 缓存、PWA 可安装（`e2ab729` + `beebecd`）

**重启核对（用户重启后）**：新插件行 `ui-connection-status` 已在启动清单里；`/assets/*.js` 与 `/plugins/*/client.js` 都返回 `content-encoding: gzip` + `vary: accept-encoding`——压缩与横幅插件都生效了。

- **CDP 离线模拟测不出横幅（重要教训）**：把浏览器设成 offline 挂 35 秒，横幅没出现；查 socket 才发现**25 条到 3080 的连接全程保持 ESTABLISHED**——CDP 的离线模拟**不会断开已建立的 WebSocket**，所以 `onStateChange('reconnecting')` 从未触发。**是没被触发，不是坏了**。真要验证必须让连接真的断（手机飞行模式、或停服务）。
- **bundle 缓存（`e2ab729`，计划 §1 候选）**：bundle 的 URL 本来就带 `?rev=<内容哈希>`，服务端却一律回 `no-cache`，重复访问时 44 个 bundle 每个都要走一次中继往返。现在只有「请求的 rev 等于注册 rev」才回 `public, max-age=31536000, immutable`（URL 内容寻址，字节不可能变），不带 rev 或 rev 过期仍回 `no-cache`；sourcemap 不带 rev、保持 revalidate。**`/assets/*` 故意不动**：SPA fallback 对未命中的资源返回 index.html + 200，给那种路径打 immutable 有可能把一份 HTML 钉在 JS 的 URL 上。
- **PWA 可安装（`beebecd`，计划 §5 第一项）**：原 manifest 只有一个 SVG 图标、无主题色、`display: fullscreen`。现在补 192/512 PNG 图标 + maskable 512（标记留在 80% 安全区内）+ 暗色壳底色（`#151517`，来自 `--dsw-alias-bg-base`）；`display` 改 **`standalone`**（fullscreen 会连状态栏一起隐藏，且页面卡住时没有浏览器 chrome 可退出）。图标由 `favicon.svg`（白鲸标记）用 cairosvg 光栅化再合成，生成脚本是一次性的（`.artifacts/gen-pwa-icons.py`，不入库），产物入库。
- **顺带修掉一个真 bug**：`frontend-static` 的 MIME 表没有 `.png`/`.woff`/`.woff2`/`.ttf`——**manifest 图标被当成 `application/octet-stream` 发**（Chrome 会因此拒绝安装），构建里全部 59 个字体文件也都在发 octet-stream。按 dist 实际内容补齐，并加了回归断言。
- **验证**：PWA 构建产物测试 3 条通过（manifest 钉死 + 每个命名图标确为 dist 里真实 PNG 而不是 SPA fallback 页）；`frontend-static` 真实 HTTP 用例新增 png/woff2 类型断言；lint 0、host typecheck 0。

### 00:45– · E1 收口：草稿保留与重连不重发（`31779c1`）

计划 §5 最后一条的后半句（"本地保留未发送草稿，但不在恢复网络时自动发送消息、批准请求或安装插件"）**在构造上本来就成立**，这一轮把它查清并钉住：

- **草稿**：草稿在 `ui-conversation/src/client/input/` 的输入机里（客户端对象层），`machine.ts`/`hub.ts` **没有任何 `connection`/`reset` 处理**——断线路径根本不会碰到它。
- **重连不重发**：`onConnected` 会发 `connection/reset`，逐个查了全部 12 个监听者：全是 `refresh`/`resync`/`load` 之类的**重新读取**，没有一处发送、提交、批准或安装。
- **钉子**：`packages/client/runtime/tests/client-apply.client.spec.ts` 新增用例，在真实 runtime 测试台上驱动「一代连接死亡 → 下一代握手完成」，断言两半：读取确实重建了（`session.list` 被再次调用），且**一个用户手势拥有的动作都没重发**（prompt / cancel / create / fork / rename / selectModel / updateQueue / respond / subagent 调用 / goal 与 settings 变更 / credentials / host.openPath）。这条会在将来有人往 `connection/reset` 里塞"自动重发"时立刻变红。
- **计划已同步**：`进化/阶段性开发计划.spec.md` 的 E1 六项勾选全部按证据更新，并明确写出唯一悬置项（组装场景 `mobile-workbench.e2e.ts`）与 E0 遗留的真机项（断网重连、停服务后手机不可达），后者与横幅的真机触发合并执行。

## 待办与注意

### 提交账目（全部已推送；`main` = `31779c1`，`codex/e0-mobile-baseline` 已并入 main 并删除）

- 工作台：Phase 1 = `0e3d00a`、Phase 2 = `482eee4`、Phase 3+4 = `85ebade`、Phase 5 = `c1a687a`、knip 修 = `f38415d`；Phase 6 市场 = `302e118`、Phase 7 壁纸 = `0ec733c`（该特性的面板/座位已于 16:10 那轮移除）。
- 可靠性：`03da2eb`（客户端 bundle 门禁 + 生成器拒绝保留 Remote 名）、`3391814`（图边检查）、`e93eedb`（保留名清单收回分析器自持）。
- 层叠：`2229d4e`（栏位不再困住 fixed 对话框）、`2bf7c07`（壁纸面板目录导航 + 会话列底色）、`14590ef`（非侧栏栏位封顶 z-index 0，修好社区主题面板的 Apply）。
- 体验：`2442158`（文本预览 + 市场默认页/中文摘要 + 删壁纸面板）、`5293c23`/`100525a`（主题面板与「系统原皮」命名）、`9843b1b`（皮肤行开关）。
- E0 移动访问（分支 `codex/e0-mobile-baseline`）：`e1b482a`（上一轮日志与重启清单）、`eab2493`（E0 部署与验收记录 + 只读探测工具 + 两份探测结果）、`f82a8fc`（把 oxlint 抑制收窄到被测的非 Error 拒绝用例）。E1 的窄屏单面板改动**未提交**，补丁存于 `.artifacts/e1-narrow-single-panel.patch`。
- E1：`ff620ce`（窄屏单面板工作台）、`bc35b20`（连接断开横幅 + connection 发布相位）、`ce300ae`/`fce8774`（首屏 gzip，-47% 字节）、`e2ab729`（bundle 内容寻址缓存）、`beebecd`（PWA 可安装 + dist MIME 表补齐）、`31779c1`（重连只重读的回归钉子 + 计划状态）、日志若干。
- 日志与共享文档按约定单独提交（`60b7e78`、`55a2c19`、`4c018b8`、`9a47072`、`f60c3a5` 等）。

### 重启清单（本次重启后应看到）

1. 浏览器不再报 `Failed to load plugins`（上一轮删 bloom 造成的 profile/进程漂移）；连接断开时顶部出现「连接已断开，正在重连…」横幅（`ui-connection-status` 行，组合自检已过）；首屏资源变成 gzip 传输（`content-encoding: gzip`，总字节约 11.7 → 6.3 MiB）。
2. `~/.dsh/profiles/web` 的 bundles：`dsh-base` / `dsh-web-app` / `archived-sessions` / `dsh-client-ui-skin-maid-atelier` / `dsh-theme` / `@eternalnight/dsh-theme`；`@kubor/dsh-bloom-theme` 已移除。
3. 工作台三页：**文件**（`.md`/`.ts`/`.json` 等现在有文本预览）、**插件市场**（打开即出默认页、按 star 排序、按语言显示摘要）、**主题**（系统原皮三行 + 注册表主题 + 皮肤启用/停用开关）。
4. 社区包自带入口：`@eternalnight/dsh-theme` 的 **Theme** 按钮（Built-in / Image / Video + Apply，已修好可点）；`dsh-theme` 的设置入口。
5. 想验证组合：`node --import tsx/esm apps/cli/src/bin.ts --profile web --dump-config | grep -E '^- id:|^# =='`。

### 约束与已知事项

- **账户余额（agent 可读）**：桌面启动块每 60 秒刷新一次，快照固定写在 `/mnt/c/Users/29461/Desktop/dsh-web/balance.json`；想知道余额直接读它，别去抓接口。抓取器是 `进化/fetch_balance.py`（密钥解析：环境变量 → `~/.bashrc` 的 `export DEEPSEEK_API_KEY=...`）。
- **这台机器的代理**：WSL 里 `HTTP(S)_PROXY` 指向 Clash（`127.0.0.1:7897`），而 `no_proxy` **不含 `100.*`**，所以任何 `*.ts.net` / tailnet 探测都必须显式绕开代理（`curl --noproxy '*'`），否则拿到的是代理的 502 而不是服务的回答。探测本机 loopback 时同理：`no_proxy` 里的 `127.*` 对 Python 不生效，要写成 `127.0.0.1`。
- **WSL 够不到 Tailscale Serve**：mirrored 网络下 WSL 也持有 `100.77.160.68/32`，该地址在 WSL 内被当成**本机地址**（`ip route get` → `dev lo`），所以 HTTPS 入口的探测只能在 Windows 侧跑。

- **栏位层叠归框架**：栏位之间只有文档顺序；非侧栏栏位取 `z-index: 0` 堆叠上下文封顶内部 z-index，侧栏不带 z-index——注册在侧栏子树里的 fixed 对话框（设置模态框、社区主题面板）才能压过会话列。给任何栏位加 z-index 前先读 `AppFrame.module.css` 的注释。
- **社区外观包不走原生注册表**：`dsh-theme` 用 `data-dsh-*`、女仆皮用 `data-dsh-maid-atelier`、`@eternalnight/dsh-theme` 用 `overrideTokens`；所以「主题」列表只列原生注册的主题（目前只有系统原皮三行），皮肤靠行级开关切换（改 profile patch，重启生效）。
- `dsh-theme` 的 `dsh.client.inject` 写了服务名 `slots`（应为包名）——信息性错误，不影响加载；`verify-client-bundles` 会把它报出来。
- 装完新插件后**必须重启**：profile 与运行进程漂移会让客户端报 `Failed to load plugins`（本轮实测过一次）。重启前先跑 `--dump-config` 组合自检 + 模块表预检。
- **并发**：另一会话在同一工作树（`packages/client/connection` 与 `DSH进化日志.md`）。本会话提交一律用显式路径；`docs/config-catalog.*` 谁后提交谁负责让中英两侧与源一致。
- 已知竞态（非本会话回归）：`apps/web/tests/steering.e2e.ts` 的 `mid-steer` golden 依赖「填充落在第一个 replay 窗口内」，重跑即绿；若 CI 复现应改为等待确定态。
- 后续未做：agent 自写扩展（ADR-5）、所有 desktop/mobile 能力（用户决定不做；mobile/远程由另一会话负责）。计划见 `community-audit/SYNTHESIS.md`。
- 桌面启动块自启已四条路径兜底，但"登录即出现"最稳的是登录触发的计划任务（需管理员，见 14:20 条目）。
