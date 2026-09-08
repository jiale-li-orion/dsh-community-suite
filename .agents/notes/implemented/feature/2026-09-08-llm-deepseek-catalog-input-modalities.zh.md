# Agent Note：DeepSeek catalog 配置项自行声明输入模态

Status: implemented

[English](2026-09-08-llm-deepseek-catalog-input-modalities.md) | 中文

## 问题

`@deepseek-ai/dsh-llm-deepseek` 在 `modelInfo` 中为每个 catalog 配置项都报 `inputModalities: ['text']`，而 `serialize.ts` 会在协议之前以 `UNSUPPORTED_CONTENT` 拒绝任何图片块。因此，一个接受图片的 DeepSeek 模型——V4.1 flash 内测版就是其一——可以被写进 catalog 并被选中，却永远无法配合图片使用：提示词准入会因解析出的模型未报 `image` 模态而拒绝该附件，即便模型支持，序列化器也会再次拒绝。

`llm-pi-ai` 已经能从配置解析每个模型的模态（[pi-ai 路由默认输入模态](../architecture/2026-08-12-pi-ai-route-default-input-modalities.md)），所以同一个模型可以经那条路由使用。那是另一条提供方路由，有自己的注册、catalog 替换和选择器条目，而且指向同一个端点：模型运行在原生 `deepseek-official` 路由上的部署没有等价写法，而随附的 composition 挂载的正是这条路由。

## 决策

**catalog 配置项自行声明 `inputModalities`；省略表示 `[text]`，空列表在加载时被拒绝。** 该字段与 `contextWindow`、`maxTokens` 并列属于 `DeepSeekCatalogModel`。它是唯一会被请求路径强制执行的建议 catalog 字段：`listModels` 与 `resolveModel` 都会报它，适配器在构造请求时也读取同一个配置项。`[text]` 保持默认，因为对 chat-completions 路由来说这是诚实的下限——没有任何东西会去询问端点接受什么，而两种错误答案的代价并不相同。少报会在附件被提交之前拒绝图片并点名模型；多报会放进一张提供方随后在轮次中途拒绝的图片，而此时提示词准入已经把该消息持久提交。

**图片字节通过可选的 `attachments` seam 解析，每个请求一次，且仅针对声明了 `image` 的配置项。** `DeepSeekAdapterOptions` 新增 `resolveAttachments`，插件提供 `() => ctx.get('attachments')`，适配器则用请求冻结的连接事实和稳定的 abort 信号构造协议图片读取器。未挂载附件服务的部署仍继续服务文本，只在图片请求上、在协议之前以 `UNSUPPORTED_CONTENT` 失败并点名缺失的服务。

**用户消息携带图片；工具结果的图片由紧随其后的一条 user 消息承载。** 带图片的用户消息序列化为有序的 `text`／`image_url` 分片，每张图片是已验证字节的 `data:` URL。纯文本用户消息保持裸字符串形式，因此其协议字节不变。system 与 assistant 内容保留拒绝：这些位置在本协议中没有表示形式，静默压平比拒绝更糟。本 note 发布时对工具结果图片的拒绝已被[工具结果图片 note](2026-09-09-llm-deepseek-tool-result-images.md)取代。

该包新增 `@deepseek-ai/dsh-attachment` 作为 peer 依赖，即 `llm-pi-ai` 消费的同一个 seam。

## 备选方案

- **保持适配器纯文本，把图片模型走 pi-ai**——这是今天可用的路径，且无需改动适配器。被否为完整答案，因为原生路由才是随附 composition 挂载、也是 `agent-default-model` 选中的路由；为了同一个端点的一项能力而要求第二条提供方路由，会为这一个字段重复注册、catalog 和选择器状态。
- **把 `inputModalities` 放在插件级而非配置项级**——一行而不是每个模型一行。被否，因为一条路由会同时服务纯文本与图片模型，路由级声明会对文本模型多报。
- **从模型 id 推断图片支持**——命名约定不是能力，而且这个模型的 id 带的是过期日期而非模态。
- **对所有模型都序列化图片，让提供方拒绝不支持的**——会把失败移到提示词准入持久提交消息之后，正是本仓库模态处理要避免的昂贵方向。
- **在配置项字段之外再加路由级 `defaultInput`**——`llm-pi-ai` 有它，因为其 catalog 描述的模型不一定都在该路由上。本适配器的 catalog 就是整条路由，所以第二个回退没有指涉对象。
- **为这条路由的图片加一条无密钥 replay 通道**——快照示例驱动的是 replay 提供方，而静态 `cordis.yml` 无法命名一个真实的 DeepSeek 端点。

## 影响

一个支持图片的 DeepSeek 模型只需一行 catalog：

```yaml
models:
  - id: deepseek-v4.1-flash-expires-on-0910
    inputModalities: [text, image]
```

什么都不写的部署与之前行为完全一致：每个配置项仍报 `['text']`，图片请求仍以 `UNSUPPORTED_CONTENT` 失败。

适配器不会验证该声明。一个声明 `image` 但端点拒绝图片的模型会在提供方处失败，此时用户消息已持久化，会话随后会反复发送一个不可能成功的请求；恢复方式是选择能服务图片的模型、在图片之前 fork，或新建会话。这是每一种乐观模态声明都有的暴露面，也是默认值保持 `[text]` 的原因。

## 测试

`packages/llm/llm-deepseek/tests/serialize.spec.ts` 覆盖协议形式：纯文本内容保持字符串形式，携带图片的消息变为带 `data:` URL 的有序分片，只有图片的消息产出一个分片，空文本块会从两种形式中丢弃，图片在 assistant 角色以及没有读取器时都会被拒绝。工具结果图片由[工具结果图片 note](2026-09-09-llm-deepseek-tool-result-images.md)覆盖。

`adapter.spec.ts` 通过真实 mock server 覆盖解析出的能力与请求路径：`listModels` 与 `resolveModelInfo` 报出已声明模态，空的 `inputModalities` 在 resolver 边界被拒绝，声明过的图片经挂载的附件服务以 `image_url` 分片到达协议，而图片请求在模型未声明图片、以及模型声明了图片但未挂载附件服务两种情况下都会在协议之前失败。`dynamic-config.spec.ts` 覆盖实时 settings catalog 声明图片模态而无需重新注册。
