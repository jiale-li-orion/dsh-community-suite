# Prefab Anchored Standard（实验性）

[English](README.md) | 中文

本目录是一个自包含的 DeepSeek Harness 模式：它把 Anchored Standard composition、一次成功 roll 的会话模板和会话内预填充插件放在同一目录。安装时只复制 `prefab/`，运行时不依赖仓库中的 `shared/` 或 `preset/`。预填充不会请求模型，也不会产生 API 费用。

## 安装（推荐：suite 安装器）

在 suite 根目录中同时安装自有 Prefab preset、其余社区 preset 和仅限 Web 的 bundle：

```sh
pnpm run community:install -- --dsh-home /path/to/.dsh
```

重启 DSH，在目标工作区选择 **Prefab Anchored Standard** 并新建会话。选择操作返回前会话已经预填充；随后直接发送任务提示词即可。suite 安装器创建所有权标记和可恢复备份，因此它是唯一受支持的更新路径。

### 仅限开发的直接 Prefab 安装

如需在 DSH 关闭时直接试验 Prefab，把仓库交给 AI 编程 agent，并让它执行 [`AGENT_INSTALL.md`](./AGENT_INSTALL.md)：

```powershell
node .\prefab\install.mjs --confirm-dsh-closed
```

这条直接路径没有 suite 所有权标记和备份，因此 suite 安装器无法更新它。Project2 派生评测模板只用于复现，必须显式选择；它使用独立的 `prefab-anchored-project2` id。

Harness 可以把该 preset 挂载到空会话，也可以创建 header 已将其设为默认预设的会话。模式内的 `prefab-session-seed.mjs` 在前一种情况监听已提交的预设选择事件，在后一种情况监听首个 `permission/preset` 事件，越过 `Session.append` 的重入边界后，把模板的两轮模型可见历史写入当前会话。它只重放 turn/step、消息和工具调用/结果，不推送数千条 token chunk，因此不会在新会话时冲击 WebUI。插件还会把 live Agent 在构造时缓存的 turn 游标同步到预填充后的第二轮，所以第一条真实提示词从 turn 3 开始，不会重复生成 turn 1。预填充会在相应事件处理完成前结束。

## 手工安装（仅限开发）

手工复制没有 suite 所有权标记和可恢复备份，suite 安装器无法更新它们。仅在本地开发时、DSH 完全关闭后复制目录：

```powershell
$mode = Join-Path $env:USERPROFILE '.dsh\.agent-presets\prefab-anchored-standard'
if (Test-Path -LiteralPath $mode) { throw "Preset already exists: $mode" }
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $mode) | Out-Null
Copy-Item -Recurse -LiteralPath '.\prefab' -Destination $mode
```

Linux/macOS：

```sh
dsh_home="${DSH_HOME:-$HOME/.dsh}"
mode="$dsh_home/.agent-presets/prefab-anchored-standard"
mkdir -p "$dsh_home/.agent-presets"
test ! -e "$mode"
cp -R prefab "$mode"
```

安装器默认使用通用模板和 `prefab-anchored-standard`。其他有效 id 也可使用；预填充插件会从安装目录名识别它：

```powershell
node .\prefab\install.mjs --confirm-dsh-closed --preset my-prefab-id
```

旧的离线实例化流程仍保留作高级兼容入口：给安装器额外传入 `--cwd 'E:\path\to\workspace'`，会再生成一个 Ready 会话。`instantiate.mjs --dry-run` 只检查替换；`--allowed-tools`、`--rename` 和 `--agents-md` 只用于这条旧式离线路径。

## 实例化时会替换什么

- 在当前空 session 内原位写入两轮预制历史，不创建第二个会话。
- 在推理、消息、工具调用和工具结果中递归替换源 cwd；兼容正斜杠、反斜杠、JSON 双反斜杠和 Windows 路径大小写变体。
- 用 `$DSH_HOME/AGENTS.md`、再用目标工作区根 `AGENTS.md` 的原文替换 roll 时指令结果；内容相同只注入一次，不扫描 README、目录或源码。两者都不存在时使用中性的“无额外规则”结果。
- 预填充时剔除 warm-up 中失败的指令文件读取调用及其错误结果。
- 模板中的 `dev_tool_search` 会为真实任务轮持久解锁 `read`、`write`、`edit`、 `glob`、`grep`、`ask_user_question`、`todo_write` 和 `web_search`；`bash`、 `str_replace_editor` 与发现工具仍常驻。

默认通用模板不包含 Project2 事实、README 输出或目录清单。显式 opt-in 的 `templates/project2-benchmark.jsonl` 保留了复现实验使用的 Project2 派生轨迹，不是通用模板。通用版通过了结构和风格检查，但 API 涨价前没有重新跑完整 Project2 评测。证据和限制见 [研究贡献](https://github.com/0liveiraaa/DeepseekCotexplorations/tree/main/contributions/xiaobright-v4-tool-surface-dose-response/)。

模板不内置 MCP 工具：保存的请求 schema 与工具调用中均无 MCP 工具，本目录也不发布 MCP server 配置或凭据。使用者若另行在该 preset/profile 中注册 MCP 工具，运行时仍可通过 `dev_tool_search` 发现并解锁。

## 文件

- `agent.cordis.yml`、`preset.yml` 与本地插件：可安装的 Anchored Standard composition。
- `template.jsonl`：已经审查并内置的会话模板。
- `template.jsonl.meta.json`：roll 来源与轨迹摘要。
- `templates/project2-benchmark.jsonl`：显式 opt-in 的评测模板。
- `prefab-session-seed.mjs`：选择模式或以该默认预设创建会话时自动原位预填充。
- `install.mjs`：一条命令完成模式安装。
- `instantiate.mjs`：兼容用的工作区级离线实例化器。
- `roll-runner.mjs`、`roll-prefab.mjs`：可选的重 roll 工具。

## 可选：重 roll 模板

这一步会真实调用模型并产生费用，需要兼容的 Harness 源码 checkout、用于多帧 zstd 解码的 Python 3.14，以及已经配置的 `headless` DSH profile。

```powershell
$env:DSH_HARNESS_ROOT = 'E:\path\to\deepseek-harness'
node .\prefab\roll-prefab.mjs --cwd 'E:\path\to\workspace' --attempts 6
```

请限制尝试次数。任何新 roll 的模板都会包含原始推理、提示词、工具调用与结果、路径和工作区内容；替换仓库内模板前，必须重新检查凭据和非预期数据。
