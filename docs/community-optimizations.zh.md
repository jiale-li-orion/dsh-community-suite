# 社区优化

[English](community-optimizations.md) | 中文

这个 rc.7 社区快照结合了 `leavelet/deepseek-harness` 的会话上下文工作、`MuWinds/dsh-archived-sessions` bundle 和 `xiaobright/dsh-anchored-standard` 运行时预设。源码修订与适配范围记录在 [COMMUNITY_SOURCES.md](../COMMUNITY_SOURCES.md) 中。

## 状态

本套件固定采用官方 `dsh-v0.1.0-rc.7` 基线，并保留仓库的 `pnpm@11.22.0` 工具链选择。DeepSeek Harness 仍处于开发者预览阶段，可能出现破坏兼容性的变更；此快照中的社区模块仅支持已记录的基线。

**今天就能跑的**：电脑上的 Web UI、从手机操作**同一个会话**、把手机上的文件接入会话工作区、带文件预览的共享工作台，以及承载浏览器那一层的 Android 薄壳。**尚未实现**：设备能力协议——已配对的手机发布诸如 `device.info` 的能力，由 agent 在**逐次确认**下调用，这正是名字所指的方向。

## 近期更新

- **2026-09-11 — 手机与电脑操作同一个会话。** 窄屏客户端呈现三页（会话／会话列表／工作台），同一时刻只显示其中一页；文字与控件按小屏缩放；流连接代际死亡时显示一行"连接中断"。手机上选中的文件落在会话工作区的 `uploads/<来源>/`，用的是输入框当场生成的接入 id；工作台里有一个按发送方分组的「上传」面板；Markdown、源码、PDF、图片、音频与视频都能就地预览。发出提示的客户端类别（`mobile-app`、`mobile-browser`、`desktop-browser`）记在那条持久化用户消息上，并在每轮向模型陈述一次。见[窄屏单面板 note](../.agents/notes/implemented/architecture/2026-09-10-narrow-single-panel-workbench.md)与[客户端来源 note](../.agents/notes/implemented/feature/2026-09-11-model-visible-client-origin.md)。
- **2026-09-11 — Android 薄壳**（[`apps/android-shell/`](../apps/android-shell/README.md)）。范围限定在手机自带浏览器给不了的那一层：按 host 广播的修订哈希做本地缓存、launcher 图标、前台服务保活，以及一个保留 host TLS 身份、绕开系统 DNS 解析层的回环代理。
- **2026-09-09 — 工具结果的图片进入模型上下文。** 工具结果里的图片现在跟随其 `role: tool` 消息、由一条 user 消息承载，因此 `read_image` 的输出以及任何含有它的历史在原生路由上都能继续使用。见[工具结果图片 note](../.agents/notes/implemented/feature/2026-09-09-llm-deepseek-tool-result-images.md)。
- **2026-09-08 — 按模型声明输入模态。** `llm-deepseek` 的每个 catalog 配置项自行声明 `inputModalities`；省略表示 `[text]`，只有声明了 `image` 的配置项才会把用户图片送到协议上。见[输入模态 note](../.agents/notes/implemented/feature/2026-09-08-llm-deepseek-catalog-input-modalities.md)。

## 有意未落地

已审计但有意未落地：agent 自写工作台扩展（设计参考 [saya-ch/dsh-mobile](https://github.com/saya-ch/dsh-mobile)）、完整的 Android／桌面客户端（[ZSeven-W/dsh-android](https://github.com/ZSeven-W/dsh-android)、[ZgblKylin/dsh-gui](https://github.com/ZgblKylin/dsh-gui)，以及仅允许设计研究的 AGPL-3.0／GPL-3.0 项目），以及让 agent 调用手机自身摄像头、文件或位置的设备能力协议——薄壳 App 只承载浏览器那一层，没有实现该协议。相关决策与每条已落地行的回滚方式记录在工作台 [Agent Notes](../.agents/notes/implemented/feature/2026-09-09-workbench-shared-view.md)。

## 会话上下文

leavelet 集成通过有界日志切片读取长历史，而不展开完整 JSONL 或 packed 日志。packed retention 保持为 persistence 的内部实现，`SessionLogCut` 则为增量 fold 提供稳定边界。历史条目携带 `firstSeq`，因此分页、分叉、重写与压缩共用一套事件范围语义。

Session Context 通过 Remote RPC 与 Web UI 提供召回、范围压缩、已审阅摘要和继续处理。摘要规划使用模型输入与输出容量，终端就绪检查则批量读取进程状态。

## 归档会话

MuWinds bundle 在 Web 设置页中列出归档会话、展示元数据和有界消息预览、恢复一个或多个会话，并删除选定会话产物。它的 Host 路由会随 Cordis 生命周期清理、检测所需能力，并在缺少所需服务时返回明确错误。详情读取使用 persistence 检查和有界日志切片。

删除只验证 persistence 提供的位置：绝对路径、basename 为 `session.jsonl` 或 `session.jsonl.zstd`，且其父目录不是根目录。它拒绝运行中的会话；空闲的 live 会话可以被 evict。缺失工件会从 archived id 中清除，并返回 `deleted: false` 和原因 `no-artifact`。删除使用 Node.js 文件系统操作，而非 shell 命令。

该 bundle 仅安装到 `web` profile，安装时不修改现有会话数据。

## 锚定预设

xiaobright 集合提供 7 个运行时预设。`anchored-standard` 先使用 Minimal 的 `bash` 与 `str_replace_editor`，再在持久事件后晋升到可发现的 resident 目录。`prefab-anchored-standard` 用内置的成功轨迹预填充空会话。`zero-anchored-standard` 先运行一轮零工具锚定，`whoami-standard` 则在处理用户任务前使用固定的自我介绍轮。

`eternal-minimal` 没有阶段转换：它始终只让模型看到 Minimal 工具对，并通过 `dshx` bash gateway 执行较重工具。`wire-think-standard` 保持工具 schema 可见，在思考时在线路层发送 `tool_choice: none`，然后返回常规 provider。`combo-anchored-standard` 将 think/execute 分段、推理深度门和工具循环中的 deliberation reminder 组合起来。具有阶段的模式会从持久会话事件持久化并恢复状态，并在组合需要时用发现工具按需暴露较重工具。

rc.7 的 wire-think adapter 支持 low reasoning，拒绝不受支持的 effort 值，保留显式空 system prompt，并报告模型的 `maxOutputTokens`。它的序列化与 replay 行为和官方 rc.7 DeepSeek adapter 一致。

预设维护层会在 Windows 上规范化 Git Bash 工作目录、探测完整的指令文件链，并为每条指令提示分配唯一 id，使主机重启时的竞态不会中断历史组装。开发工具搜索使用模糊 token 评分，并在目录没有匹配项时说明如何通过 `toolNames` 直接解锁。Prefab 播种同时覆盖手动切换预设的会话和创建时已将其设为默认值的会话，包括技能加载完成后才发布 agent 的情况。

安装器将它们发布到 `.agent-presets` 下，并且只有在 `--update` 标识安装器自有目标时才会替换预设。

## 核验与兼容性

聚焦的 session、persistence、projection、Context、compaction、API proxy、terminal 和 Web 测试均通过。归档会话 bundle 有 8 项通过测试，覆盖生命周期、有界详情、恢复和安全删除。适配后的预设包有 216 项通过的 keyless 检查，包含共享文件同步、维护性回归与 rc.7 adapter 行为。安装器有 16 项测试，覆盖仅限 Web 的 bundle 目标、7 个预设标识、自有更新检查、备份行为、pnpm `--` 分隔符回归和不访问 sessions 目录。

keyless snapshot 有 118 项通过、1 项跳过；显式空密钥 Web lane 有 255 项通过、15 项跳过。验证不发起真实 DeepSeek API 请求。coverage 汇总为 statements 98.36%、branches 97.33%、functions 98.28%、lines 98.64%；移植代码仍低于 rc.7 的逐文件 100% coverage gate。

该快照面向 `dsh-v0.1.0-rc.7`。DeepSeek Harness 仍处于开发者预览阶段，后续官方版本可能需要兼容性调整。这些检查覆盖已说明的 rc.7 路径，并不证明与每个 profile、plugin、主机文件系统或未来版本兼容。
