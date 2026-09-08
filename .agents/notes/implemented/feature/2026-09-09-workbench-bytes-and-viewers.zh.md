# Agent Note：工作台字节经一条受围栏保护的路由流式输出，查看器是链式座位

Status: implemented

[English](2026-09-09-workbench-bytes-and-viewers.md) | 中文

## Problem

文件面板能列出一个工作区目录，却无法显示文件：harness 里唯一的字节通道是附件 RPC，它对整张图片返回 base64；而社区的两个媒体项目各错一边。`dsh-media-preview` 的 Range/206/416 语义是对的，却在信任栅栏后服务**整个文件系统**（`notes/dsh-media-preview.md:6`）；`dsh-music-player` 声称流式，实际先把整个文件读进内存再切片，每次请求一次堆拷贝（`notes/dsh-music-player.md:91`）。ADR-4 已经定了方向——走 `webServer` 路由、经 `ctx.fs` 围栏、施加浏览器信任栅栏——但还没有实现。

## Decision

**一条 host 路由提供工作区字节，过两道围栏。** `@deepseek-ai/dsh-workbench-bytes` 注册 `webServer` 前缀 `/workbench/file`。请求先过浏览器信任栅栏：新增的 `HostConnectionService.isTrustedRequest(request)` 施加部署配置的 `trustedHosts`——与 `/api` 桥同一套策略，作为公开方法暴露，使第二个路由拥有者不必复述策略、也不必再多一个配置项。再过 `fenceSessionPath`，即面板列目录用的同一道会话 `cwd` 围栏（现由两个调用方共享在 `@deepseek-ai/dsh-workbench` 中）。之后才用 `createReadStream` 打开解析出的目标的进程路径。

**Range 处理是一个纯函数。** `parseRange(header, size)` 返回 `full` / `partial` / `unsatisfiable`；路由以 `206` 加 `content-range`、`416` 加 `bytes */<size>`、以及只带头部不带正文的 `HEAD` 作答。畸形、多范围或未知单位的请求头会被忽略并返回完整表示——RFC 9110 允许这样做，代价是客户端重试而不是被拒绝。

**媒体类型只有一个家。** `contentTypeForPath` 与工作台领域放在一起，`listDir` 给每个文件条目打上它。字节路由把它当作 `Content-Type`，查看器链据此路由，浏览器不再从文件名反推类型。路由自身的位置同样是唯一常量 `WORKBENCH_FILE_PATH`，通过 `WorkbenchListing.fileRoute` 报告给客户端，因此客户端用的是 host 的值，而不是另写一份字面量。

**查看器是外壳持有的链式座位。** `workbench` 这条注册在 `workbench.panel`（list）之外再声明 `workbench.viewer`（chain）。`@deepseek-ai/dsh-client-ui-workbench` 为每个媒体族注册一条——`image/*`、`audio/*`、`video/*`——其纯选择器选中列举里的 `mediaType`；没有条目认领的类型落到外壳的「无预览」提示。面板通过注入的控制器把文件写进外壳 store 来请求预览，于是任何面板都能复用这个座位，也不会有面板需要自己声明槽位。

**预览选择留在浏览器本地。** 某个窗口在看哪个文件从不跨 Remote 边界；只有栏的开关与面板选择归 host 所有，因为那是 agent 需要共享的事实。

## Alternatives considered

- **走既有 `/api` RPC 传字节。** 否决：附件通道已经证明代价——JSON 信封里的 base64 意味着内存里一整份拷贝且没有 Range，视频无法拖动。
- **把路由注册在 `/api` 下并继承它的栅栏。** 否决：webserver 先匹配最长前缀，更长的 `/api/...` 会赢下匹配并静默绕过 connection 插件的处理器；靠位置近不代表继承了栅栏。
- **在路由包里复制信任栅栏。** 否决：`trustedHosts` 是部署事实，两份拷贝会漂移，或迫使运维配置两次。把既有判定暴露在 connection 服务上才是「一套策略」。
- **把查看器作为文件面板自己的子槽位。** 否决：槽位名是全局的，第一个声明 `workbench.viewer` 的面板会挡住所有其他面板；座位归外壳，面板只发起请求。
- **经 RPC 发路径、让浏览器取 `file://` URL。** 否决：浏览器读不到 host 路径，而且这会把围栏挪到客户端。
- **在浏览器里按扩展名匹配查看器。** 否决：这会复制 host 的映射，并让两边对「这是什么文件」产生分歧。

## Consequences

视频可以拖动进度，大图可以渐进加载，会话工作区之外的文件从浏览器不可达。两道围栏彼此独立：信任栅栏限定**谁**能问，工作区栅栏限定**什么**能被服务，各自都有真实 socket 测试。Range 支持的代价是一个纯解析器及其矩阵测试；多范围响应刻意未实现，因为没有查看器会发它。

## Testing

`packages/workbench/workbench-bytes/tests/range.spec.ts` 钉住范围矩阵（闭区间、开区间、后缀、越界裁剪、不可满足、畸形、多范围、零长度）；`tests/route.spec.ts` 用真实 `WebServer`（OS 分配端口）驱动注册的路由：整文件与范围读取、`HEAD`、`416`、`400`、`405`、两道 `403` 围栏、`404`、无尺寸的分块路径，以及头部发出后的流失败。`packages/workbench/workbench/tests/workbench.spec.ts` 覆盖列举的媒体类型、围栏辅助函数与不变式的失败分支。`packages/client/ui-workbench/tests/*` 覆盖 store、外壳的查看器派发与回退、三个查看器的选择器与元素、文件面板的预览请求，以及注册的拆卸。`pnpm run test:gui` 与 `DSH_SNAPSHOT=replay` 的 web 车道覆盖组装后的浏览器。
