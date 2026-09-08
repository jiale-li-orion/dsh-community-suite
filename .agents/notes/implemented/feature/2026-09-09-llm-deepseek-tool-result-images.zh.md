# Agent Note：DeepSeek 工具结果的图片由紧随其后的一条 user 消息承载

Status: implemented

[English](2026-09-09-llm-deepseek-tool-result-images.md) | 中文

## 问题

`@deepseek-ai/dsh-llm-deepseek` 只在 user 消息里承载图片。`tool-result` 块里的图片会以 `UNSUPPORTED_CONTENT` 被拒绝，而且这条拒绝与模型声明的模态无关。`read_image` 工具的能力门查的正是那些模态（[read-image.ts](../../../../packages/fs/tool-fs/src/read-image.ts)），因此在声明了 `image` 的 catalog 配置项上，工具会放行这次读取，图片进入持久会话历史，随后**下一个**请求就失败——对所有模型都失败，因为序列化器拒绝的是位置而不是模型。进入这种状态的会话在本路由上完全无法继续；恢复办法只有在图片之前 fork、新开会话，或改选 pi-ai 路由——后者的转换确实承载工具结果图片。

## 决策

**`role: 'tool'` 消息只承载文本；连续的一段工具结果消息先发出各自的工具消息，再用一条 user 消息承载它们的图片。** 该 user 消息以字面量 `Attached image(s) from tool result:` 开头，随后按内容顺序每个图片一个 `image_url` 分片。按段合并可以避免一条 user 消息插在同一 assistant 轮次的多个工具结果之间，而端点对工具调用配对并不承诺接受这种形状。该协议形状与 `llm-pi-ai` 的 OpenAI-completions 路径已发往同一端点的形状一致。

**图片在任意嵌套深度都会被收集**，与 `contentHasImage` 使用同一递归，因此 harness 记录的任何图片都不会被静默压平。有图片但没有文本的工具结果会以 `(see attached image)` 通过协议发送，而不是 `(no output)`。

**图片读取器仍然把关每个位置。** 没有读取器时——即 catalog 配置项未声明 `image` 的模型——工具结果的图片会在协议之前失败，报出与用户图片相同的 `UNSUPPORTED_CONTENT` 消息。system 与 assistant 角色上的图片保留拒绝：这些位置在本协议中没有表示形式。

## 考虑过的替代方案

- **保留拒绝**（本 note 所取代的决策）。`read_image` 的能力门与序列化器互相矛盾：声明 `image` 放行了一个序列化器随后拒绝的工具结果，而持久历史让这次失败永久化。已否决。
- **把图片挂到承载工具结果文本的那条 user 消息上。** harness 让每个工具结果独占一条没有顶层内容的 user 消息，因此不存在可挂载的消息；而在工具消息之前合成一条，会把图片排到它所归属的结果之前。
- **把图片分片放进 `tool` 消息的 `content` 数组而不是字符串。** 工具消息契约规定的是字符串；用数组等于依赖网关未记录的容忍度。
- **每个工具结果发一条通知 user 消息，而不是每段一条。** 更简单，但会把 user 消息插在同一 assistant 轮次的多个工具结果之间。

## 后果

声明了 `image` 的模型现在可以服务 `read_image` 的输出，历史里已经含有这类输出的会话也能在本路由上继续。`read_image` 的能力门与序列化器对"这条路由能承载什么"达成一致。

代价是协议体积增长：一段产生图片的工具结果会多出一条 user 消息，承载通知文本与图片分片，而没有文本的图片结果现在发送 `(see attached image)`。无论哪种方式，图片字节每个请求都只计费一次。声明的乐观性不变——声明了 `image` 但端点拒绝图片的模型，仍会在消息持久化之后、在提供方那里失败。

## 测试

`packages/llm/llm-deepseek/tests/serialize.spec.ts` 固定了协议形状：工具结果的图片变为一条工具消息加一条通知 user 消息，连续的工具结果合并进同一条这样的消息，只有图片的结果发送哨兵文本，嵌套工具结果里的图片也会被承载，一段工具结果在下一个消息处结束，没有读取器时工具结果图片被拒绝。`adapter.spec.ts` 与 `loader-composition.spec.ts` 继续覆盖请求路径与 catalog 声明。

该序列化器为工具结果图片生成的请求体已发送到 `https://api.deepseek.com/chat/completions`；`deepseek-v4.1-flash-expires-on-0910` 与 `deepseek-v4-flash-vision-exp` 都答出了所附 PNG 里写的单词。

本路由没有 keyless 快照覆盖：快照示例驱动的是 replay provider，无法在静态 `cordis.yml` 中命名一个真实的 DeepSeek 端点（[输入模态 note](2026-09-08-llm-deepseek-catalog-input-modalities.md)）。
