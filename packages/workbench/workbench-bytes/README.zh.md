# @deepseek-ai/dsh-workbench-bytes

[English](README.md) | 中文

工作台的字节路由：一条 `webServer` 前缀（`/workbench/file`）把工作区文件流式送给浏览器里的文件面板查看器。请求带会话 id 与路径；路由先过浏览器信任栅栏（`connection.isTrustedRequest`，即部署的 `trustedHosts` 策略），再过工作区栅栏（`dsh-workbench` 的 `fenceSessionPath`，与面板列目录用的是同一个），然后从解析出的目标的进程路径用 `createReadStream` 流式输出。`Range` 请求返回 `206` 加 `content-range`，不可满足的范围返回 `416`，`HEAD` 只回头部不带正文——所以视频可以拖动进度、大图可以边下边看，而不需要把整个文件读进内存。

## 上传与接入记录

`POST /workbench/upload` 接收文件正文，以及查询参数 `sessionId`、`name`、可选的 `device` 和 `ingestId`。请求经过同一浏览器信任检查与工作区围栏，文件落入 `uploads/<device>/`；未声明来源时使用 `unknown`。`maxUploadBytes` 控制大小上限，默认 64 MiB。上传返回路径和字节数，不创建用户消息。

带 `ingestId` 的成功上传在 `uploads/.dsh/ingest.json` 记录路径、字节数、SHA-256、来源类别和接收时间。已完成请求的顺序重试返回原记录，附 `repeat: true`，不读取重试正文。ID 作为数据键处理，包括 `constructor` 与 `__proto__`。重放前校验磁盘记录的字段与接收目录内的相对路径；无效记录被忽略，其它有效记录保留。索引缺失或无法解析时从空索引开始；这可能使重试创建另一份文件，不能视为崩溃恢复保证。

## Model Experience

无：本包只服务浏览器字节；面向模型的工作台投影在 `dsh-tool-workbench`。

#### KV Cache effect

无；本包既不组装也不发送 provider 请求。

## Known Limitations and Deferred Work

- **一次请求只支持一个范围** — 多范围请求头会被忽略并返回整个表示；查看器只发单范围，而 multipart/byteranges 响应要额外写一个边界编码器，目前没有消费者。
- **接入恢复** — 并发请求没有按 ID 串行化，文件与索引没有事务提交；成功记录也不重新验证文件是否被移动或修改。MIME 验证与过期清理尚未实现。
- **栅栏就是会话记录的工作目录** — 没有记录工作目录的会话无法被服务，目录之外的路径以 `403` 拒绝。
