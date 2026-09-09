# @deepseek-ai/dsh-plugin-install

[English](README.md) | 中文

浏览器调用 `ctx.remote.pluginInstall.installPlugin(url)`，Host 方法保留 `ctx.pluginInstall.install(url)`。Remote 名称避开 namespace 服务内部的 `install` 方法。两个生成 Remote 的 provider 均声明 `zod` 运行时依赖，供客户端打包时内联 codec。

两个平面共用的安装能力。`ctx.pluginInstall.install(url)` 解析 URL 指向的目录条目，把该条目自带的安装命令交给 `parseInstallTarget`，从本次构建自身的模块路径推导出目标 profile，并以 argv 数组经 subprocess 通道执行 `dsh plugin --profile <profile> add <target>`。同一份实现同时服务 agent 工具（它把调用挡在 `ctx.approval` 之后）与插件市场面板（点击本身就是人的手势），因此「校验过的目标」「推导出的 profile」「一条进程路径」都只有一份。

## Model Experience

无：本包只执行安装；面向模型的工具在 `dsh-plugin-catalog-tools`。

#### KV Cache effect

无；本包既不组装也不发送 provider 请求。

## Known Limitations and Deferred Work

- **需要重启** — 安装进运行中 profile 的插件要等进程重启才会挂载；调用方会说明这一点，本服务无法重载组合。
- **没有卸载** — 移除插件是目录未描述的另一项操作，因此推迟而不是猜测。
- **只有一种目标语法** — 仅 npm 规格与 `github:owner/repo[#subpath]`；其他安装来源需要显式决策，而不是放宽正则。
