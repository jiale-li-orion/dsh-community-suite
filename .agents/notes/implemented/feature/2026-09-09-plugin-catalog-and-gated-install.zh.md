# Agent Note：插件发现读取已发布索引，安装是一条经审批的 argv，而不是路由

Status: implemented

[English](2026-09-09-plugin-catalog-and-gated-install.md) | 中文

## 问题

工作台已经能展示文件，但部署仍然无法回答「有哪些插件」以及「怎么装」。被审计的社区项目在这两点上各错一处，ADR-7 已具体点名：`dsh-plugins-store` 从自己注册在 `/api/dshmarketplace/*` 下的精确路径路由里 shell 调用原生命令来安装，而精确路由优先于 `/api` 前缀，于是这些处理器**完全绕开** rc.7 的信任栅栏——用户访问的任何页面都可能触发安装（`notes/dsh-plugins-store.md:6-13`）。它的提交历史还记录过：一个 `tools/pre-execute` 监听器返回裸 `undefined`，短路了内置放行，导致该会话所有工具调用失败。另一方面，`awesome-dsh-plugin` 发布了一份 CC0 索引，含 3,408 条条目，且每条自带预构建的 `dsh plugin --profile web add <target>` 命令（`notes/awesome-dsh-plugin.md:3-5`），所以自建目录意味着要维护一条远重于工作台本分的流水线。

## 决策

**发现是能力，不是数据源。** `@deepseek-ai/dsh-plugin-catalog` 持有词表（`PluginCatalogEntry`、`PluginCatalogQuery`、`PluginCatalogPage`）与抽象的 `ctx.pluginCatalog` 服务，方法为 `search({ query, category, limit })` 与 `get(url)`。`@deepseek-ai/dsh-plugin-catalog-awesome` 是 provider：对已发布的 `plugins.json` 抓取一次，一次性校验成该词表，按 TTL 缓存在内存里，并以 `If-None-Match` 重新校验——索引未变时代价是一个 `304`。非 2xx 应答、不可达主机、超过 `maxBytes` 的正文、非法 JSON、缺少 `plugins` 数组，或条目缺少必填字段，都会以带 code 的 `PluginCatalogError` 明确失败；provider 绝不提供残缺索引。

**索引是数据，所以模型拿到的是工具，而不是页面。** `@deepseek-ai/dsh-plugin-catalog-tools` 注册 `plugin_search`（返回身份、摘要、热度以及目录自带的安装命令）与 `plugin_install`。没有路由、没有槽位、没有镜像；目录像任何其他 host 服务一样经能力 seam 消费。

**安装是经审批的 argv，绝不是命令字符串。** `plugin_install` 只接受搜索结果携带的 URL，经 provider 解析出该条目，再把它自带的 `install` 文本交给 `parseInstallTarget`——后者只接受 `dsh plugin [--profile <name>] add <target>`，且目标只能是 npm 规格或 `github:owner/repo[#subpath]`，不得含 `..`、不得含 shell 元字符。命令文本从不被执行，也不会由条目字段拼装出命令。profile 来自本次构建自身的模块路径（`$DSH_HOME/profiles/<name>/node_modules/…`），绝不来自索引；源码启动推导不出时明确失败并要求设置 `profile` 配置键。决定经 `ctx.approval.request` 提交（agent、call id、理由、signal），只有 `allowed-once` 才继续；被接受的 argv 以数组形式经 `ctx.subprocess.spawn` 执行，因此没有任何 shell 解析它。

**`stars`／`downloads` 保持可空。** 索引用 `null` 表示「未发布或未观测」，工具会省略该字段而不是打印 0——后者会被读成「实测热度」。

## 考虑过的替代方案

- **用 `webServer` 路由提供目录（plugins-store 的做法）。** 否决：那正是 ADR-7 记录的绕过路径，而且浏览器页面绝不应该能安装任何东西。面向模型的工具加审批就是全部入口。
- **由 `npm`／`url` 字段拼装安装命令。** 否决：索引已经发布了经过校验的命令，拼装只会让两个来源对「执行什么」产生分歧。工具只取目标，并运行自己的 argv。
- **信任索引命令里写的 profile。** 否决：第三方字符串不应决定部署写入哪个 profile。运行中的构建自己给出 profile。
- **加一个 `tools/pre-execute` 门禁。** 否决：审批已经守在「执行这个操作」的地方，而被审计的失败模式（waterfall 监听器返回 `undefined`）在这里只有代价没有收益。
- **随包提供索引快照。** 否决：索引每晚变化且 3 MB；TTL 缓存加一个可覆盖的 URL 是更小的承诺。

## 后果

部署获得了发现能力与可审批的安装，且不需要新增路由，模型也能找到它叫不出名字的插件。安装会以审批事件对的形式留在会话日志里，人可以逐条审计。代价是发现依赖网络（可用 `url` 覆盖）、装好的插件要等重启才加载，以及没有卸载路径——这是有意推迟，而不是猜一个。

## 测试

`packages/workbench/plugin-catalog/tests/plugin-catalog.spec.ts` 覆盖抽象 provider 发布的服务与带 code 的错误。`packages/workbench/plugin-catalog-awesome/tests/plugin-catalog-awesome.spec.ts` 用真实 HTTP 服务器驱动 provider：按子串搜索（含中文摘要）、按分类、按页大小、按 URL `get`、TTL 缓存、`If-None-Match` 重新校验、并发共享一次抓取，以及每条拒绝路径（非 2xx、非法 JSON、条目漂移、声明长度与分块两种超限、无正文的 200、不可达主机、无缓存时的 304、调用方中止）。`packages/workbench/tool-plugin-catalog/tests/tool-plugin-catalog.spec.ts` 用真实工具注册表与审批服务驱动两个工具（目录与进程通道为记录式假实现），并钉住目标校验矩阵（接受 npm 与 `github:` 形状；拒绝外来命令、路径穿越、元字符与未知形式）以及 profile 解析。`pnpm run test:gui` 与 `DSH_SNAPSHOT=replay` 的 web 车道覆盖组装后的浏览器，`apps/web/tests/shipped-composition.e2e.ts` 断言随产品发布的目录现在列出这两个工具。
