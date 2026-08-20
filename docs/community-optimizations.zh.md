# 社区优化

[English](community-optimizations.md) | 中文

这个 rc.7 社区快照结合了 `leavelet/deepseek-harness` 的会话上下文工作、`MuWinds/dsh-archived-sessions` bundle 和 `xiaobright/dsh-anchored-standard` 运行时预设。源码修订与适配范围记录在 [COMMUNITY_SOURCES.md](../COMMUNITY_SOURCES.md) 中。

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

安装器将它们发布到 `.agent-presets` 下，并且只有在 `--update` 标识安装器自有目标时才会替换预设。

## 核验与兼容性

聚焦的 session、persistence、projection、Context、compaction、API proxy、terminal 和 Web 测试均通过。归档会话 bundle 有 8 项通过测试，覆盖生命周期、有界详情、恢复和安全删除。预设包有 207 项通过检查，包含共享文件同步与 rc.7 adapter 行为。安装器有 16 项测试，覆盖仅限 Web 的 bundle 目标、7 个预设标识、自有更新检查、备份行为、pnpm `--` 分隔符回归和不访问 sessions 目录。

keyless snapshot 有 118 项通过、1 项跳过；显式空密钥 Web lane 有 255 项通过、15 项跳过。验证不发起真实 DeepSeek API 请求。coverage 汇总为 statements 98.36%、branches 97.33%、functions 98.28%、lines 98.64%；移植代码仍低于 rc.7 的逐文件 100% coverage gate。

该快照面向 `dsh-v0.1.0-rc.7`。DeepSeek Harness 仍处于开发者预览阶段，后续官方版本可能需要兼容性调整。这些检查覆盖已说明的 rc.7 路径，并不证明与每个 profile、plugin、主机文件系统或未来版本兼容。
