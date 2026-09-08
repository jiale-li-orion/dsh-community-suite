# @deepseek-ai/dsh-plugin-catalog

[English](README.md) | 中文

插件目录能力。Service Definition 持有词表——一条条目（身份、摘要、热度，以及索引自带的安装命令）与一页结果——因此消费者永远不需要知道数据来自哪里；provider 负责索引的传输、校验与缓存。`search({ query, category, limit })` 过滤已加载的索引，`get(url)` 解析某次搜索返回的那条确切条目，这正是「安装目标无法被凭空编造」的依据。

## Model Experience

无：本包只定义能力；面向模型的工具在 `dsh-plugin-catalog-tools`。

#### KV Cache effect

无；本包既不组装也不发送 provider 请求。

## Known Limitations and Deferred Work

- **同一时刻只有一个 provider** — 抽象服务只被提供一次，因此部署只能选一个索引；第二个来源需要像 `web` 那样的注册表。
- **没有写入侧** — 本能力只读取已发布的索引；发布、评分或策展条目不在范围内。
