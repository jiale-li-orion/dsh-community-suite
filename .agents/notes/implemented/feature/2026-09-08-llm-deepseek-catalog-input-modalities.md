# Agent Note: A DeepSeek catalog entry declares its own input modalities

Status: implemented

English | [中文](2026-09-08-llm-deepseek-catalog-input-modalities.zh.md)

## Problem

`@deepseek-ai/dsh-llm-deepseek` reported `inputModalities: ['text']` for every catalog entry in `modelInfo`, and `serialize.ts` rejected any image block with `UNSUPPORTED_CONTENT` before the wire. A DeepSeek model that accepts images — the V4.1 flash beta is one — could therefore be listed in the catalog and selected, but never used with an image: prompt admission refuses the attachment because the resolved model reports no `image` modality, and the serializer would refuse it again even if the model did.

`llm-pi-ai` already resolves per-model modalities from configuration ([pi-ai route default input modalities](../architecture/2026-08-12-pi-ai-route-default-input-modalities.md)), so the same model is reachable over that route. That is a second provider route with its own registration, catalog replacement, and selector entry, and it points at the same endpoint: a deployment whose model runs on the native `deepseek-official` route had no equivalent, and the shipped composition mounts that route.

## Decision

**A catalog entry declares `inputModalities`; omission means `[text]`, and an empty list is refused at load.** The field rides `DeepSeekCatalogModel` beside `contextWindow` and `maxTokens`. It is the one advisory catalog field a request path enforces: `listModels` and `resolveModel` report it, and the adapter reads the same entry when building a request. `[text]` stays the default because it is the honest floor for a chat-completions route — nothing interrogates the endpoint for what it accepts, and the two wrong answers do not cost the same. Under-claiming refuses the image before the attachment is committed and names the model; over-claiming admits an image the provider rejects mid-turn, after prompt admission has already committed the message durably.

**Image bytes resolve through the optional `attachments` seam, once per request, and only for an entry declaring `image`.** `DeepSeekAdapterOptions` gained `resolveAttachments`, the plugin supplies `() => ctx.get('attachments')`, and the adapter builds the wire image reader from the request's frozen connection facts and stable abort signal. A deployment without a mounted attachment service keeps serving text and fails only an image request, before the wire, with `UNSUPPORTED_CONTENT` naming the missing service.

**User messages carry images; a tool result's images follow it in a user message.** A user message with images serializes as ordered `text`/`image_url` parts, each image a `data:` URL of the verified bytes. A text-only user message keeps the bare string form, so its wire bytes are unchanged. System and assistant content keep the refusal: those positions have no representation in this protocol, and flattening them away silently would be worse than refusing. The tool-result refusal this note shipped with is superseded by the [tool-result images note](2026-09-09-llm-deepseek-tool-result-images.md).

The package gains `@deepseek-ai/dsh-attachment` as a peer dependency, the same seam `llm-pi-ai` consumes.

## Alternatives considered

- **Keep the adapter text-only and route image models through pi-ai** — the working path today, and it needs no adapter change. Rejected as the whole answer because the native route is the one the shipped composition mounts and the one `agent-default-model` selects; requiring a second provider route to reach a capability of the same endpoint duplicates registration, catalog, and selector state for one field.
- **`inputModalities` at the plugin level rather than per entry** — one line instead of one per model. Rejected because a route serves text-only and image models side by side, and a route-wide claim over-claims for the text models.
- **Infer image support from the model id** — a naming convention is not a capability, and this model's id carries an expiry date rather than a modality.
- **Serialize images for every model and let the provider reject unsupported ones** — moves the failure after prompt admission commits the message durably, the expensive direction the harness's modality handling exists to avoid.
- **A route-level `defaultInput` beside the entry field** — `llm-pi-ai` has one because its catalog describes models the route may not. This adapter's catalog *is* the whole route, so a second fallback would have no referent.
- **A keyless replay lane for images on this route** — the snapshot examples drive the replay provider, and a live DeepSeek endpoint cannot be named by a static `cordis.yml`.

## Consequences

An image-capable DeepSeek model costs one catalog line:

```yaml
models:
  - id: deepseek-v4.1-flash-expires-on-0910
    inputModalities: [text, image]
```

A deployment that writes nothing keeps its previous behavior exactly: every entry still reports `['text']`, and an image request still fails with `UNSUPPORTED_CONTENT`.

The adapter does not verify the claim. A model declaring `image` whose endpoint refuses images fails at the provider, after the user message is durable, and the session then re-sends a request that cannot succeed; recovery is to select a model that serves images, fork before the image, or start a session. That is the same exposure every optimistic modality declaration carries, and it is why the default stays `[text]`.

## Testing

`packages/llm/llm-deepseek/tests/serialize.spec.ts` covers the wire forms: text-only content keeps the string form, a message carrying images becomes ordered parts with a `data:` URL, an image-only message emits one part, empty text blocks are dropped from both forms, and an image is refused on the assistant role and without a reader. Tool-result images are covered by the [tool-result images note](2026-09-09-llm-deepseek-tool-result-images.md).

`adapter.spec.ts` covers the resolved capability and the request path through a real mock server: `listModels` and `resolveModelInfo` report declared modalities, an empty `inputModalities` is refused at the resolver boundary, a declared image reaches the wire as an `image_url` part through a mounted attachment service, and an image request fails before the wire both when the model declares no image and when it declares images but no attachment service is mounted. `dynamic-config.spec.ts` covers a live settings catalog declaring image modalities without re-registration.
