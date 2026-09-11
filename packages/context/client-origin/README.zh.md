# @deepseek-ai/dsh-client-origin

[English](README.md) | 中文

把"本轮提示来自哪一类客户端"告诉模型，使回答能针对**人手里那块屏幕**来写。类别是从**持久化的用户消息**里读出来的，而不是从传输层猜的——所以模型看到的与日志能重放的是同一个事实。决策记录：[client-origin Agent Note](../../../.agents/notes/implemented/feature/2026-09-11-model-visible-client-origin.md)。

## 模型会看到什么

每轮一条，在开启该轮的那一步注入：

```
Client that sent this request: mobile-app. Answer for that client: a phone app has a
small screen, and the paths it names are the ones it can reach, not the ones this
machine can.
```

类别只有三种：`mobile-app`、`mobile-browser`、`desktop-browser`。若同一轮的消息声明了不止一种，就如实写成 `mixed` 并列出全部类别；**一条都没声明时，本插件不改动链路的决定——客户端不上报类别的部署不会注入任何内容，也永远不会被猜一个值。** 只在该轮第一步注入：类别在其所在轮内不会变，逐步重复等于用上下文重复一个没有变化的事实。

## 类别从哪来

客户端**每页取样一次**自己的类别，并在每次 `session.prompt` 时带上。手机薄壳在它加载的 URL 上自报（只有我们自己的壳知道自己是 App）；浏览器只上报其平台暴露的**粗粒度屏幕类别**；没有页面可分类的运行时什么都不报。Host 按闭集校验该值，**不在集合内则按 `invalid-client-device` 拒绝**，并把合法值连同浏览器时区与提示的 `rpcId` 一起写进**那一条持久化用户消息**。本插件只读这些消息：不读连接状态、请求头或地址，也**不存储任何设备名、型号或地址**。
