# @deepseek-ai/dsh-plugin-catalog-awesome

[English](README.md) | 中文

基于已发布的 [`awesome-dsh-plugin`](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 索引（CC0）的目录 provider。对生成的 `plugins.json` 做一次 HTTP 抓取，一次性校验成目录词表并在内存里按 TTL 缓存；TTL 之后刷新是一次条件请求，索引未变时代价为 `304`。畸形载荷、字段漂移、超限正文、非 2xx 应答或不可达主机，都会以带 code 的 `PluginCatalogError` 明确失败，而不是提供一份残缺索引。

## Model Experience

无：本包只加载索引；面向模型的工具在 `dsh-plugin-catalog-tools`。

#### KV Cache effect

无；本包既不组装也不发送 provider 请求。

## Known Limitations and Deferred Work

- **一个 provider 一个索引** — URL 是配置，缓存只持有一份载荷；第二个索引需要第二条行（而能力只接受一个 provider）。
- **默认从公共站点抓取** — 离线部署把 `url` 指向镜像或同一份 JSON 的 npm 安装副本；没有随包快照。
- **条目只是数据，不是已审核** — 索引自己写明「收录不等于安全审查」，`stars`／`downloads` 可能过期；`null` 表示未知，绝不表示 0。
