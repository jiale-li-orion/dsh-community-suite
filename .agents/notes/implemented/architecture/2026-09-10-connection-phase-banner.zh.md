# Agent Note：为连接断开横幅发布连接相位

Status: implemented

[English](2026-09-10-connection-phase-banner.md) | 中文

> 范围：connection 插件为什么要把自己的连接相位作为服务面发布，以及消费它的横幅为什么只做呈现。

## 问题

连接断掉原本是不可见的。`ConnectionController` 只把 `reconnecting` 报告给唯一被允许启动流循环的消费者，而那个消费者（runtime 对象层）有意丢掉该代的作用域交互状态、并在下一次握手后重建——它不告诉任何人。在中继后面接入的手机上，症状就是一个看起来卡死的应用，而用户还没发出去的草稿仍在输入框里。

这个相位对别人也读不到：`start()` 对第二个消费者直接抛错，而 `hostDescription` 在断线时只是撤回，从不说明处于哪个状态，所以 UI 插件没有受支持的观察方式。

## 决定

connection 插件现在把它本来就算出来的相位发布为 `ConnectionHandle.connectionState`——一对 `getSnapshot`/`subscribe`，由同一个喂给消费者 sink 的 `onStateChange` 包装更新，循环停止时清空。循环启动前它是"不存在"，这是诚实的状态：没有循环，就不对连通性作任何断言。

`@deepseek-ai/dsh-client-ui-connection-status` 把这个相位渲染进 ui-layout 的 `shell.overlay` 列表——横跨框架的增量座位。连接正常时该条目不渲染，所以正常路径下 overlay 层是空的；循环未启动时也什么都不渲染。

横幅只做呈现。重连不会自动重试任何用户发起过的事情：不重发消息、不重新批准、不安装插件。哪些状态必须丢掉、哪些要重建，已经归 runtime 所有；在这里复制任何一条，都会造出那份决定的第二个更弱的副本。

被否决的方案：让横幅自己调 `ctx.connection.start()`（流循环按设计只允许单消费者）；把横幅并进 `ui-layout`（框架归属方会多出一个数据层关注点）；用一次失败的 RPC 或停滞的流去推断断线（一种猜测式信号，会把健康的 host 报成故障）。

## 后果

- connection 服务多出一个只读面；它的生命周期与单消费者规则不变。
- 测试里的 `ConnectionHandle` 假实现必须提供 `connectionState`——两个 runtime 测试台已同步更新。
- 横幅在 **host 重启后**才出现：新增插件行属于 profile 组合，而不是客户端 bundle 的热重载。

## 验证

`packages/client/ui-connection-status/tests/connection-banner.client.spec.tsx` 覆盖：overlay 注册与 fiber 拆除（HMR 安全）、两侧字典及其撤回、node 半边为空、invariant 配套，以及横幅在 `connected`、`reconnecting` 与"尚未启动"三种相位下的渲染。
