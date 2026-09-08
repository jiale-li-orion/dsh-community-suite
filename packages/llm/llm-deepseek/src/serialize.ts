/**
 * Serialize harness messages into DeepSeek chat completions. User text is joined; assistant text
 * becomes `content`, tool calls become `tool_calls`, and tool results become separate tool messages.
 * Assistant reasoning is replayed as `reasoning_content` only on tool-call turns, as required by
 * thinking-mode passback. Image blocks become `image_url` data URLs for a model whose catalog entry
 * declares image input; without an image reader they are rejected rather than silently flattened
 * away. A tool message carries text only, so a tool result's images follow it as one user message.
 * Unknown declaration-merged block types retain the adapter's documented extension fallback.
 * @module dsh-llm-deepseek/serialize
 */

import type { ImageAttachmentRef, StoredImageAttachment } from '@deepseek-ai/dsh-attachment'
import { contentHasImage, LlmError } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, GenerateOptions, Message } from '@deepseek-ai/dsh-llm'
import type {
  WireImagePart,
  WireMessage,
  WireRequest,
  WireTextPart,
  WireTool,
  WireUserContent,
} from './types.ts'

/** Adapter-level request defaults (from plugin config). */
export interface RequestDefaults {
  thinking?: 'enabled' | 'disabled' | undefined
  reasoningEffort?: 'off' | 'low' | 'high' | 'max' | undefined
}

/**
 * Read one durable image attachment's verified bytes for wire encoding. The
 * adapter supplies this only when the selected model declares image input, so
 * its absence is exactly what makes image content unsupported for a request.
 */
export type WireImageReader = (ref: ImageAttachmentRef) => Promise<StoredImageAttachment>

interface ResolvedThinking {
  thinking?: 'enabled' | 'disabled'
  reasoningEffort?: 'low' | 'high' | 'max'
}

/** Validate the adapter-owned effort before resolving its DeepSeek wire fields. */
function reasoningEffort(effort: NonNullable<GenerateOptions['reasoningEffort']>): 'off' | 'low' | 'high' | 'max' {
  if (effort === 'off' || effort === 'low' || effort === 'high' || effort === 'max') {
    return effort as 'off' | 'low' | 'high' | 'max'
  }
  throw new LlmError(
    `DeepSeek does not support reasoning effort "${effort}"`,
    'UNSUPPORTED_REASONING_EFFORT',
  )
}

/** Resolve one legal thinking/effort pair without exposing `off` as a wire effort. */
function resolveThinking(options: GenerateOptions, defaults: RequestDefaults): ResolvedThinking {
  if (options.purpose === 'session-title') return { thinking: 'disabled' }
  const effort = options.reasoningEffort === undefined
    ? defaults.reasoningEffort
    : reasoningEffort(options.reasoningEffort)
  if (defaults.thinking === 'disabled' && effort !== undefined && effort !== 'off') {
    throw new LlmError(
      `DeepSeek deployment does not support reasoning effort "${effort}"`,
      'UNSUPPORTED_REASONING_EFFORT',
    )
  }
  if (effort === 'off') return { thinking: 'disabled' }
  if (effort === 'low' || effort === 'high' || effort === 'max') {
    return { thinking: 'enabled', reasoningEffort: effort }
  }
  return defaults.thinking === undefined ? {} : { thinking: defaults.thinking }
}

/** Join the text blocks of a message (used for system, assistant, and user text). */
function flattenText(blocks: ContentBlock[]): string {
  return blocks
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
}

/** Reject core image content in a position this wire route cannot carry it. */
function assertTextOnly(blocks: readonly ContentBlock[]): void {
  if (contentHasImage(blocks)) {
    throw new LlmError('The DeepSeek chat-completions adapter does not support image content here.', 'UNSUPPORTED_CONTENT')
  }
}

/** Encode one image attachment as the `data:` URL the wire expects. */
async function imageUrl(ref: ImageAttachmentRef, readImage: WireImageReader | undefined): Promise<string> {
  if (readImage === undefined) {
    throw new LlmError(
      'The DeepSeek chat-completions adapter does not support image content for this model.',
      'UNSUPPORTED_CONTENT',
    )
  }
  const stored = await readImage(ref)
  return `data:${stored.ref.mediaType};base64,${Buffer.from(stored.data).toString('base64')}`
}

/** Join a tool result's text blocks, recursing through nested results. */
function toolResultText(blocks: readonly ContentBlock[]): string {
  return blocks
    .map(block => block.type === 'text'
      ? block.text
      : block.type === 'tool-result' ? toolResultText(block.content) : '')
    .join('')
}

/**
 * Encode every image a tool result carries, at any nesting depth, as wire
 * parts. A `role: 'tool'` message carries text only, so these parts travel in
 * the user message {@link serializeMessages} emits after the tool messages; a
 * request without a reader refuses instead of dropping them.
 * @param blocks - the tool result's typed content.
 * @param readImage - attachment reader, or undefined when this model takes no images.
 * @returns the image parts in content order.
 */
async function toolResultImages(
  blocks: readonly ContentBlock[],
  readImage: WireImageReader | undefined,
): Promise<WireImagePart[]> {
  const parts: WireImagePart[] = []
  for (const block of blocks) {
    if (block.type === 'image') {
      parts.push({ type: 'image_url', image_url: { url: await imageUrl(block.attachment, readImage) } })
      continue
    }
    if (block.type === 'tool-result') parts.push(...await toolResultImages(block.content, readImage))
  }
  return parts
}

/** Model-facing lead-in for the user message carrying a tool result's images. */
const TOOL_RESULT_IMAGE_NOTICE = 'Attached image(s) from tool result:'

/** Sentinel a tool message sends when its result produced images but no text. */
const TOOL_RESULT_IMAGE_SENTINEL = '(see attached image)'

/**
 * Build one user message's wire content. A text-only message keeps the bare
 * string form, so its wire bytes stay identical to a request built without
 * image support; a message carrying images becomes ordered parts. Tool results
 * become their own wire messages, so this contributes nothing for them.
 * @param blocks - the user message's typed content.
 * @param readImage - attachment reader, or undefined when this model takes no images.
 * @returns the string form for text-only content, otherwise ordered wire parts.
 */
async function userContent(
  blocks: readonly ContentBlock[],
  readImage: WireImageReader | undefined,
): Promise<WireUserContent> {
  const text: string[] = []
  const parts: (WireTextPart | WireImagePart)[] = []
  let hasImage = false
  for (const block of blocks) {
    if (block.type === 'text') {
      if (block.text.length > 0) {
        text.push(block.text)
        parts.push({ type: 'text', text: block.text })
      }
      continue
    }
    if (block.type === 'image') {
      hasImage = true
      parts.push({ type: 'image_url', image_url: { url: await imageUrl(block.attachment, readImage) } })
      continue
    }
    if (block.type === 'tool-result') continue
    // Other merge-extensible blocks are not user-input vocabulary.
  }
  return hasImage ? parts : text.join('')
}

/** Serialize one assistant message (text + reasoning + tool calls). */
function serializeAssistant(message: Message): WireMessage {
  const text = flattenText(message.content)
  const reasoning = message.content
    .filter(block => block.type === 'reasoning')
    .map(block => block.text)
    .join('')
  const toolCalls = message.content
    .filter(block => block.type === 'tool-call')
    .map(block => ({
      id: block.id,
      type: 'function' as const,
      function: { name: block.name, arguments: block.arguments },
    }))

  return {
    role: 'assistant',
    // Text-less turns send "" — NEVER null. Pure tool-call turns: the
    // official samples replay message.content verbatim (which is "") and
    // some gateways reject null outright. Reasoning-ONLY turns (the model
    // can answer entirely in the reasoning channel, e.g. a v4-flash
    // greeting): the live API rejects null-content/no-tool_calls assistant
    // messages with a 400 ("content or tool_calls must be set"), and since
    // the message sits durably in the session log, a null here bricks every
    // later turn of that session.
    content: text,
    // Official passback rule (guides/thinking_mode.mdx): reasoning_content
    // must return on tool-call turns; it is ignored on plain turns, so we
    // drop it there to save tokens.
    ...toolCalls.length > 0 && reasoning.length > 0 ? { reasoning_content: reasoning } : {},
    ...toolCalls.length > 0 ? { tool_calls: toolCalls } : {},
  }
}

/**
 * Serialize the conversation. `tool-result` blocks become standalone
 * `{role: 'tool'}` messages; the harness puts each tool result in its own
 * user-role message, so a mixed user message contributes its text first and
 * its tool results as separate wire messages after. One run of consecutive
 * tool-result messages emits its tool messages and then a single user message
 * carrying every image they produced, so no user message separates the tool
 * results of one assistant turn.
 * @param messages - the harness conversation, in order.
 * @param readImage - attachment reader for user and tool-result images; undefined rejects them.
 * @returns the wire messages; order preserved, each tool result expanded into its own entry.
 */
export async function serializeMessages(
  messages: Message[],
  readImage?: WireImageReader,
): Promise<WireMessage[]> {
  const wire: WireMessage[] = []
  let pendingImages: WireImagePart[] = []
  /** Emit the user message that carries a finished run of tool-result images. */
  const flushToolImages = (): void => {
    if (pendingImages.length === 0) return
    wire.push({
      role: 'user',
      content: [{ type: 'text', text: TOOL_RESULT_IMAGE_NOTICE }, ...pendingImages],
    })
    pendingImages = []
  }
  for (const message of messages) {
    if (message.role === 'system') {
      flushToolImages()
      assertTextOnly(message.content)
      wire.push({ role: 'system', content: flattenText(message.content) })
      continue
    }
    if (message.role === 'assistant') {
      flushToolImages()
      assertTextOnly(message.content)
      wire.push(serializeAssistant(message))
      continue
    }
    // user role: tool results ride in user messages in the harness
    // vocabulary, but DeepSeek wants them as role:'tool' messages.
    const toolResults = message.content.filter(block => block.type === 'tool-result')
    if (toolResults.length === 0) {
      flushToolImages()
      wire.push({ role: 'user', content: await userContent(message.content, readImage) })
      continue
    }
    const content = await userContent(message.content, readImage)
    if (typeof content !== 'string' || content.length > 0) wire.push({ role: 'user', content })
    for (const result of toolResults) {
      const images = await toolResultImages(result.content, readImage)
      pendingImages.push(...images)
      wire.push({
        role: 'tool',
        tool_call_id: result.toolCallId,
        // Empty tool output still needs SOME content on the wire.
        content: toolResultText(result.content)
          || (images.length > 0 ? TOOL_RESULT_IMAGE_SENTINEL : '(no output)'),
      })
    }
  }
  flushToolImages()
  return wire
}

/**
 * Build the full wire request. Always streaming (`stream: true`, usage
 * reporting on); optional fields are omitted rather than sent as null, so
 * provider defaults apply.
 * @param options - the harness request (model, history, system, tools, sampling).
 * @param defaults - adapter-level thinking defaults; undefined fields put nothing on the wire.
 * @param readImage - attachment reader for user and tool-result images; undefined rejects them.
 * @returns the chat-completions request body.
 */
export async function serializeRequest(
  options: GenerateOptions,
  defaults: RequestDefaults = {},
  readImage?: WireImageReader,
): Promise<WireRequest> {
  const messages: WireMessage[] = []
  if (options.system !== undefined) {
    messages.push({ role: 'system', content: options.system })
  }
  messages.push(...await serializeMessages(options.messages, readImage))

  const tools: WireTool[] | undefined = options.tools?.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))
  // A short title budget must produce visible text; conversation and
  // compaction calls continue to inherit the adapter's thinking defaults.
  const resolvedThinking = resolveThinking(options, defaults)

  return {
    model: options.model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    ...resolvedThinking.thinking !== undefined ? { thinking: { type: resolvedThinking.thinking } } : {},
    ...resolvedThinking.reasoningEffort !== undefined
      ? { reasoning_effort: resolvedThinking.reasoningEffort }
      : {},
    ...tools !== undefined && tools.length > 0 ? { tools } : {},
    ...options.temperature !== undefined ? { temperature: options.temperature } : {},
    ...options.maxTokens === undefined ? {} : { max_tokens: options.maxTokens },
    ...options.stop !== undefined ? { stop: options.stop } : {},
  }
}
