# Agent Note: A DeepSeek tool result's images travel in a following user message

Status: implemented

English | [中文](2026-09-09-llm-deepseek-tool-result-images.zh.md)

## Problem

`@deepseek-ai/dsh-llm-deepseek` carried images only in user messages. A `tool-result` block's images were refused with `UNSUPPORTED_CONTENT`, and that refusal ignored the model's declared modalities. The `read_image` tool gates on exactly those modalities ([read-image.ts](../../../../packages/fs/tool-fs/src/read-image.ts)), so on a catalog entry declaring `image` the tool admits the read, the image enters durable session history, and the *next* request fails — for every model, because the serializer refuses the position rather than the model. A session that reached that state could not continue on this route at all; the recovery was to fork before the image, start a session, or select the pi-ai route, whose conversion does carry tool-result images.

## Decision

**A `role: 'tool'` message carries text only; a run of consecutive tool-result messages emits its tool messages and then one user message carrying their images.** That user message leads with the literal `Attached image(s) from tool result:` followed by one `image_url` part per image, in content order. Batching the run keeps a user message from separating the tool results of one assistant turn, which the endpoint's tool-call pairing rules do not promise to accept. The wire shape matches what `llm-pi-ai`'s OpenAI-completions path already sends to the same endpoint.

**Images are collected at any nesting depth**, the same recursion `contentHasImage` uses, so no image the harness records is silently flattened away. A tool result with images and no text crosses the wire as `(see attached image)` instead of `(no output)`.

**The image reader still gates every position.** Without a reader — a model whose catalog entry omits `image` — a tool-result image fails before the wire with the same `UNSUPPORTED_CONTENT` message a user image gets. Images on the system and assistant roles keep their refusal: those positions have no representation in this protocol.

## Alternatives considered

- **Keep the refusal** (the decision this note supersedes). The `read_image` capability gate and the serializer disagreed: declaring `image` admitted a tool result the serializer then rejected, and the durable history made the failure permanent. Rejected.
- **Attach the images to the user message that carries the tool result's text.** The harness gives each tool result its own user-role message with no top-level content, so there is no such message to attach to; synthesizing one before the tool message would place the image ahead of the result it belongs to.
- **Put image parts in the `tool` message's `content` array instead of a string.** The tool-message contract documents a string; an array would rely on undocumented gateway tolerance.
- **Emit one notice user message per tool result rather than per run.** Simpler, but it interleaves user messages between the tool results of a single assistant turn.

## Consequences

A model whose entry declares `image` now serves `read_image` output, and a session whose history already contains such output continues on this route again. The `read_image` gate and the serializer agree on what the route carries.

The cost is wire growth: a run of tool results that produced images gains one user message carrying the notice text plus the image parts, and a text-less image result now sends `(see attached image)`. Image bytes are charged once per request either way. The declaration stays optimistic — a model declaring `image` whose endpoint refuses images still fails at the provider, after the message is durable.

## Testing

`packages/llm/llm-deepseek/tests/serialize.spec.ts` pins the wire forms: a tool-result image becomes a tool message followed by the notice user message, consecutive tool results batch into one such message, an image-only result sends the sentinel, an image nested in a nested tool result is carried, a run ends at the next message, and a tool-result image without a reader is refused. `adapter.spec.ts` and `loader-composition.spec.ts` keep covering the request path and the catalog declaration.

The request body this serializer produces for a tool-result image was sent to `https://api.deepseek.com/chat/completions`; `deepseek-v4.1-flash-expires-on-0910` and `deepseek-v4-flash-vision-exp` both answered the word written in the attached PNG.

No keyless snapshot covers this route: the snapshot examples drive the replay provider and cannot name a live DeepSeek endpoint ([input modalities note](2026-09-08-llm-deepseek-catalog-input-modalities.md)).
