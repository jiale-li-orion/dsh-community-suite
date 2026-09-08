# @deepseek-ai/dsh-plugin-catalog-tools

[English](README.md) | 中文

面向模型的插件目录工具。`plugin_search` 读取已配置的目录，返回每条条目的身份、单行摘要、热度以及目录自带的安装命令；`plugin_install` 用搜索返回的 URL 解析出确切条目，校验该条目的安装目标，向 `ctx.approval` 请求决定，之后才经 subprocess 通道以 argv 数组执行 `dsh plugin --profile <profile> add <target>`。目录里的命令文本从不被执行：只取它的目标，且必须通过 `parseInstallTarget`（npm 规格或 `github:owner/repo[#subpath]`，无父目录段、无 shell 元字符）。profile 来自本次构建自身的模块路径——安装绝不信任索引里写的 profile。

## Model Experience

### Tool schemas

#### What the model sees

在本工具集可见时生成的 [`plugin_search` 与 `plugin_install` schema](../../../docs/tool-catalog.md#deepseek-aidsh-plugin-catalog-tools)。

#### Token effect

工具可见时每次请求的固定 schema 成本。

#### KV Cache effect

在工具定义与可见性不变时前缀稳定。注册生命周期或作用域限制可能从第一个变化的 schema token 起使复用失效。

### Results and notices

#### What the model sees

`plugin_search` 返回 `No catalog entries matched.` 或 `N catalog entries matched.`，外加每条条目一个 Markdown 块（名称、owner、摘要、URL、分类、stars、安装命令）；分页被截断时会说明展示了几条、总共几条。`plugin_install` 返回 `Installed <name> into profile "<profile>". Restart the process to load it.`，子进程输出非空时附在末尾。

#### Token effect

结果保留在父历史中直到压缩。一页由 `limit` 限定（默认 10，上限 50）；安装输出上限 32 KiB。

#### KV Cache effect

只追加；新可见内容跟在可复用的请求前缀之后，不会让既有 KV-cache 条目失效。

## Known Limitations and Deferred Work

- **需要重启** — 安装进运行中 profile 的插件要等进程重启才会挂载；工具会说明这一点，但无法重载组合。
- **没有卸载** — 移除插件是目录未描述的另一项操作，因此推迟而不是猜测。
- **搜索只是子串匹配** — 已发布索引没有服务端查询，匹配发生在已加载条目上的客户端；除目录顺序外没有排序。
