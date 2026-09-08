# @deepseek-ai/dsh-workbench-bytes

[English](README.md) | 中文

工作台的字节路由：一条 `webServer` 前缀（`/workbench/file`）把工作区文件流式送给浏览器里的文件面板查看器。请求带会话 id 与路径；路由先过浏览器信任栅栏（`connection.isTrustedRequest`，即部署的 `trustedHosts` 策略），再过工作区栅栏（`dsh-workbench` 的 `fenceSessionPath`，与面板列目录用的是同一个），然后从解析出的目标的进程路径用 `createReadStream` 流式输出。`Range` 请求返回 `206` 加 `content-range`，不可满足的范围返回 `416`，`HEAD` 只回头部不带正文——所以视频可以拖动进度、大图可以边下边看，而不需要把整个文件读进内存。

## Model Experience

无：本包只服务浏览器字节；面向模型的工作台投影在 `dsh-tool-workbench`。

#### KV Cache effect

无；本包既不组装也不发送 provider 请求。

## Known Limitations and Deferred Work

- **一次请求只支持一个范围** — 多范围请求头会被忽略并返回整个表示；查看器只发单范围，而 multipart/byteranges 响应要额外写一个边界编码器，目前没有消费者。
- **只读** — 这条路由只读；从工作台写工作区文件属于后续阶段。
- **栅栏就是会话记录的工作目录** — 没有记录工作目录的会话无法被服务，目录之外的路径以 `403` 拒绝。
