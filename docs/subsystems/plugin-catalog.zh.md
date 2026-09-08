# 插件目录

[English](plugin-catalog.md) | 中文

`@deepseek-ai/dsh-plugin-catalog` 是能力本身，而不是数据源：它持有条目与查询词表（`PluginCatalogEntry`、`PluginCatalogQuery`、`PluginCatalogPage`）以及抽象的 `ctx.pluginCatalog` 服务——`search({ query, category, limit })` 过滤已加载的索引，`get(url)` 解析出某次搜索返回的那条确切条目。`@deepseek-ai/dsh-plugin-catalog-awesome` 是 provider：对已发布的 CC0 [`awesome-dsh-plugin`](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 索引抓取一次，一次性校验成该词表，并按 TTL 缓存、以 `If-None-Match` 重新校验。`@deepseek-ai/dsh-plugin-catalog-tools` 是消费者：`plugin_search` 读取目录，`plugin_install` 用 URL 解析条目、校验该条目自带的安装目标，并只在获得审批后执行它。

## 发现

provider 绝不提供残缺索引。非 2xx 应答、不可达主机、超过 `maxBytes` 的正文、非法 JSON、缺少 `plugins` 数组，或条目缺少必填字段，都会以带 code 的 `PluginCatalogError` 明确失败——消费者要么看到完整一页，要么看到错误。`stars` 与 `downloads` 故意可为空：索引用 `null` 表示「未发布或未观测」，工具会省略该字段而不是打印 0。

## 安装

安装是受审批保护的操作，而不是一条路由。`plugin_install` 只接受搜索结果携带的 URL，经 provider 解析出该条目，再把它自带的 `install` 命令交给 `parseInstallTarget`——后者只接受 `dsh plugin [--profile <name>] add <target>`，且目标只能是 npm 规格或 `github:owner/repo[#subpath]`，不得含父目录段与 shell 元字符。命令文本从不被执行，也不会由条目字段拼装出命令；profile 来自本次构建自身的模块路径，因此索引无法指定安装写入哪个 profile。决定经 `ctx.approval`，被接受的 argv 以数组形式经 subprocess 通道执行。装好的插件要等进程重启才会挂载，工具会说明这一点。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxplugincatalog--plugincatalog-abstract-seam"></a>

### `ctx.pluginCatalog` — `PluginCatalog` (abstract seam)

Abstract plugin catalog provider. A provider owns one index's transport and validation; consumers see only entries and pages, and `get(url)` resolves the exact entry a search returned so an install never invents a target.

```ts cordis-catalog
/**
 * Search the catalog.
 * @param query - the filter and page size.
 * @param signal - optional caller cancellation.
 * @returns matching entries in catalog order plus the pre-limit total.
 */
abstract search(query: PluginCatalogQuery, signal?: AbortSignal): Promise<PluginCatalogPage>

/**
 * Resolve one entry by its canonical URL.
 * @param url - the entry URL a search returned.
 * @param signal - optional caller cancellation.
 * @returns the entry, or undefined when the index has none.
 */
abstract get(url: string, signal?: AbortSignal): Promise<PluginCatalogEntry | undefined>
```

Source: [`packages/workbench/plugin-catalog/src/index.ts:44`](../../packages/workbench/plugin-catalog/src/index.ts)
<!-- END GENERATED cordis-surface -->
