# Agent Note：特权方法集只在部署显式开启时才跟随已声明的权威

Status: implemented

[English](2026-09-09-privileged-authority-opt-in.md) | 中文

## 问题

`/api` 栅栏接受 Host 为回环地址或已声明 `trustedHosts` 权威的请求，但特权方法集——`host.pickDirectory`、`host.openPath`、设置面与凭据面、agent preset 创作面，以及 `llm.discoverModels`——是**以空信任表**过这道栅栏的，因此无论 `trustedHosts` 写了什么，这些方法对所有非回环调用方一律 403（见[栅栏决策记录](../architecture/2026-07-28-api-browser-trust-boundary.md)）。于是，通过私有设备网络从第二台设备访问 Web GUI 的部署（正是多设备设计针对的 Tailscale tailnet 场景）能加载界面、列出会话与工作区、流式收下每一轮，但设置面板、凭据视图、preset 名单和"添加工作区"的原生选择器全部失败。这个钉死是有意为之，作为默认值也依然正确：这些方法会读取已暴露的配置、驱动宿主桌面或管理密钥，而 `trustedHosts` 是 DNS rebinding 栅栏，不是认证。

## 决策

**用一个可选配置字段把特权方法集从回环移到已声明的权威。** `@deepseek-ai/dsh-client-connection` 新增 `privilegedAuthority: 'loopback' | 'trusted'`，默认 `'loopback'`。node 半侧在 apply 时把它解析成特权检查传给 `isTrustedApiRequest` 的名单：默认下为 `[]`，`'trusted'` 下为 `trustedHosts`。其余所有关卡——Host／Origin／cross-site 栅栏、加载时的规范权威校验、WebSocket upgrade 的回环钉死——都不变，因此 `'trusted'` 只放宽这一个判断。

**默认值就是已发布行为。** 不设该字段的部署逐字节保持回环钉死，现有组合行为不变，栅栏决策记录里的安全论证对它们依旧成立。

**取值在配置边界按封闭联合校验。** 未知字符串会让插件加载明确报错，而不是悄悄回退到操作者没选的值。

## 考虑过的替代方案

- **直接去掉钉死。** 否决：那会把设置面与凭据面交给默认由 `0.0.0.0` 推导出的信任名单上的任何 LAN 调用方，而这正是钉死要拒绝的侦察。
- **让 `trustedHosts` 条目各自带一个特权标记。** 否决：特权集是方法的属性而不是调用方的属性；按权威区分会让两个权威能触及同一平面的不同半边，而栅栏的权威比较无法表达这种区分。
- **保留钉死，让第二台设备经回环访问 GUI**（SSH 或 `tailscale serve` 隧道终止在宿主上）。作为产品答案否决：人手动输网址时可行，但除非隧道重写 Host 与 Origin，请求权威仍非回环，而那是在拆掉栅栏而不是做出判断。
- **等认证层。** 属于推迟而非否决：对不可信网络，真正的认证层才是长期正解，在有它之前默认仍是 `'loopback'`。本次的可选项覆盖了当前设计针对的情形——对端都是操作者自己的设备。

## 后果

tailnet 部署设置 `privilegedAuthority: 'trusted'` 后，第二台设备获得完整 GUI，包括设置、凭据、preset 和原生目录选择器。代价是这道栅栏的权威名单现在治理第二个判断，因此如果操作者一边开了开关、一边声明了很宽的 `trustedHosts`，实际放宽的范围会超出预期；README 已写明 `'trusted'` 放宽的是可达性而不是信任。没有新增事件，不影响 session 日志，也不涉及模型可见面：改动就是一个配置字段和传给既有栅栏的一份名单。

## 测试

`packages/client/connection/tests/node-half.host.spec.ts` 覆盖两个取值：原有的回环钉死测试仍在默认配置下断言已声明权威调用每个特权方法都得到 403；新增测试断言在 `privilegedAuthority: 'trusted'` 下同一集合能到达载体，而未声明的权威依旧被栅栏直接拒绝。`pnpm run gen-config-catalog` 会把新字段记入生成的配置目录。
