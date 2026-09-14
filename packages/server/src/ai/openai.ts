// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { isObject } from '@medplum/core';
import { getLogger } from '../logger';

/**
 * The OpenAI provider.
 *
 * Everything specific to OpenAI's wire formats lives here: request body shapes, the
 * `/chat/completions` and `/responses` endpoints, and SSE parsing for both. Callers work in terms
 * of {@link AiResult} and {@link AiStreamEvent}, so a second provider only has to produce those
 * same types. Those types also carry the provider's payload verbatim, but only as an opt-in
 * extra alongside the normalized fields — nothing a caller needs in order to act on a response
 * requires reading it.
 *
 * Callers always speak chat-completions: `messages` and `tools` arrive in that schema and tool
 * calls leave in it. When a request is routed to `/responses` (see {@link selectApi}) the
 * translation happens here in both directions, so bots and clients are unaware of which endpoint
 * answered.
 *
 * Also serves any OpenAI-compatible API, such as a LiteLLM proxy pointed at by `LLM_BASE_URL`.
 * Such a proxy is under no obligation to send exactly what OpenAI sends, so responses are
 * treated as unknown JSON and checked field by field rather than cast into shape.
 */

/** Which OpenAI endpoint to call. */
export type AiApi = 'chat' | 'responses';

/**
 * What a caller asks the model to do, plus the credentials to do it with.
 *
 * `messages` and `tools` are forwarded to the provider verbatim, so they stay `unknown[]`
 * instead of restating OpenAI's request schema here. Credentials travel with each request
 * rather than in a module singleton, because they come from `Project.secret` and therefore
 * differ between projects on the same server.
 */
export interface AiContext {
  readonly messages: unknown[];
  readonly model: string;
  readonly tools?: unknown[];
  readonly temperature?: number;
  /**
   * Reasoning effort for models that reason before answering. Sent as `reasoning_effort` on
   * chat-completions and as `reasoning.effort` on the Responses API. Non-reasoning models reject
   * the parameter outright, so it is only sent when the caller asks for it.
   */
  readonly reasoningEffort?: string;
  /**
   * Which endpoint to call. When omitted, chosen by {@link selectApi}: `/responses` for the one
   * combination chat-completions rejects — function tools together with a reasoning effort other
   * than `none` — and `/chat/completions` otherwise, which keeps OpenAI-compatible proxies that
   * lack a Responses endpoint working.
   */
  readonly api?: AiApi;
  readonly apiKey: string;
  /** Base URL of the provider's API, with no trailing slash. */
  readonly baseUrl: string;
}

/**
 * A tool call the model requested, with `arguments` parsed out of the JSON string it arrives as.
 *
 * A truncated or malformed call keeps `arguments` as that raw string, so callers must expect
 * either. A call carrying no arguments at all becomes `{}`.
 */
interface AiToolCall {
  readonly id?: string;
  readonly type: string;
  readonly function: {
    readonly name?: string;
    readonly arguments: unknown;
  };
}

/**
 * The complete result of a non-streaming call.
 *
 * `content` and `toolCalls` are normalized so a caller can act on any provider without knowing
 * which one answered. `raw` is that provider's payload untouched, for callers that need what
 * normalizing leaves behind — `finish_reason`, token usage, refusals, a model fingerprint —
 * and `provider` tells them whose schema `raw` follows.
 */
export interface AiResult {
  readonly content: string | null;
  readonly toolCalls: AiToolCall[];
  readonly provider: string;
  readonly raw: unknown;
}

/**
 * A provider-neutral event from a streaming call.
 *
 * Content arrives incrementally and is emitted as it does. Tool calls are only actionable once
 * complete, so a provider emits at most one `tool_calls` event, after all content. Every chunk
 * that parsed is additionally reported verbatim as a `raw` event, so nothing the provider sent
 * is lost to normalization.
 */
type AiStreamEvent =
  | { readonly type: 'content'; readonly text: string }
  | { readonly type: 'tool_calls'; readonly toolCalls: AiToolCall[] }
  | { readonly type: 'raw'; readonly chunk: unknown };

/** Names the chat-completions schema in {@link AiResult.provider}, for callers that read `raw`. */
const PROVIDER_CHAT = 'openai';

/** Names the Responses API schema in {@link AiResult.provider}, for callers that read `raw`. */
const PROVIDER_RESPONSES = 'openai-responses';

/**
 * A tool call reassembled from streamed deltas.
 * OpenAI splits each call across chunks: the first carries `id` and `function.name`,
 * later ones append `function.arguments` fragments. `index` identifies the call.
 */
interface StreamedToolCall {
  id?: string;
  type?: string;
  name?: string;
  arguments: string;
}

/**
 * Parses tool call arguments, which OpenAI sends as a JSON string.
 * @param raw - The raw arguments string
 * @returns The parsed value, `{}` if there were no arguments, or `raw` unchanged if it is not valid JSON
 */
function parseArguments(raw: string): unknown {
  if (raw === '') {
    // A call to a tool that takes no parameters arrives with its arguments empty or absent.
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    // A truncated stream or a malformed call leaves the fragment unparseable. Hand it over
    // as-is rather than dropping the call, so the caller can decide what to do.
    return raw;
  }
}

/**
 * Decides which endpoint a request goes to.
 *
 * An explicit `api` wins. Otherwise chat-completions is the default, and `/responses` is used
 * only for the combination chat-completions refuses: function tools plus a reasoning effort other
 * than `none`.
 * @param context - The request
 * @returns The endpoint to call
 */
export function selectApi(context: AiContext): AiApi {
  if (context.api) {
    return context.api;
  }
  const hasTools = Boolean(context.tools && context.tools.length > 0);
  const reasons = context.reasoningEffort !== undefined && context.reasoningEffort !== 'none';
  return hasTools && reasons ? 'responses' : 'chat';
}

/**
 * Builds the chat-completions request body.
 * @param context - The request and its credentials
 * @param stream - Whether to ask for a streamed response
 * @returns The request body to POST
 */
function buildChatRequestBody(context: AiContext, stream: boolean): Record<string, unknown> {
  const requestBody: Record<string, unknown> = {
    model: context.model,
    messages: context.messages,
  };

  if (context.temperature !== undefined) {
    requestBody.temperature = context.temperature;
  }

  if (context.reasoningEffort !== undefined) {
    requestBody.reasoning_effort = context.reasoningEffort;
  }

  if (stream) {
    requestBody.stream = true;
  }

  if (context.tools && context.tools.length > 0) {
    requestBody.tools = context.tools;
    requestBody.tool_choice = 'auto';
  }

  return requestBody;
}

/**
 * Serializes tool call arguments for the wire. Callers may hand over history whose arguments were
 * already parsed into objects; the provider wants the JSON string form.
 * @param args - Arguments as a string or an already-parsed value
 * @returns The JSON string form
 */
function stringifyArguments(args: unknown): string {
  if (typeof args === 'string') {
    return args;
  }
  return args === undefined ? '' : JSON.stringify(args);
}

/**
 * Converts chat-completions messages into Responses API input items.
 *
 * Text messages keep their role. An assistant turn that called tools becomes one `function_call`
 * item per call, and a `tool` message becomes the matching `function_call_output`, keyed by the
 * same call id so a conversation recorded in chat-completions form replays faithfully.
 * @param messages - Messages in chat-completions form
 * @returns Input items for the Responses API
 */
function toResponsesInput(messages: unknown[]): unknown[] {
  const items: unknown[] = [];
  for (const message of messages) {
    if (!isObject(message)) {
      continue;
    }
    if (message.role === 'tool') {
      items.push({
        type: 'function_call_output',
        call_id: message.tool_call_id,
        output: typeof message.content === 'string' ? message.content : JSON.stringify(message.content ?? ''),
      });
      continue;
    }
    if (message.content !== null && message.content !== undefined && message.content !== '') {
      items.push({ role: message.role, content: message.content });
    }
    if (Array.isArray(message.tool_calls)) {
      for (const toolCall of message.tool_calls) {
        if (!isObject(toolCall)) {
          continue;
        }
        const fn = isObject(toolCall.function) ? toolCall.function : undefined;
        items.push({
          type: 'function_call',
          call_id: toolCall.id,
          name: fn?.name,
          arguments: stringifyArguments(fn?.arguments),
        });
      }
    }
  }
  return items;
}

/**
 * Converts chat-completions tool definitions into Responses API tool definitions, which carry
 * `name`, `description` and `parameters` directly instead of under `function`. A definition that
 * is already flat is passed through.
 * @param tools - Tool definitions in chat-completions form
 * @returns Tool definitions for the Responses API
 */
function toResponsesTools(tools: unknown[]): unknown[] {
  return tools.map((tool) => {
    if (!isObject(tool) || !isObject(tool.function)) {
      return tool;
    }
    const { function: fn, ...rest } = tool;
    return { ...rest, ...fn };
  });
}

/**
 * Builds the Responses API request body.
 *
 * `store` is off because the platform keeps its own conversation history and replays it in full
 * on every call; letting the provider keep a copy too would only add retention to reason about.
 * @param context - The request and its credentials
 * @param stream - Whether to ask for a streamed response
 * @returns The request body to POST
 */
function buildResponsesRequestBody(context: AiContext, stream: boolean): Record<string, unknown> {
  const requestBody: Record<string, unknown> = {
    model: context.model,
    input: toResponsesInput(context.messages),
    store: false,
  };

  if (context.temperature !== undefined) {
    requestBody.temperature = context.temperature;
  }

  if (context.reasoningEffort !== undefined) {
    requestBody.reasoning = { effort: context.reasoningEffort };
  }

  if (stream) {
    requestBody.stream = true;
  }

  if (context.tools && context.tools.length > 0) {
    requestBody.tools = toResponsesTools(context.tools);
    requestBody.tool_choice = 'auto';
  }

  return requestBody;
}

/**
 * The single outbound call to the provider. Both entry points funnel through here.
 * @param context - The request and its credentials
 * @param api - The endpoint to call
 * @param stream - Whether to ask for a streamed response
 * @returns The raw fetch response
 */
async function postRequest(context: AiContext, api: AiApi, stream: boolean): Promise<Response> {
  const path = api === 'responses' ? '/responses' : '/chat/completions';
  const body = api === 'responses' ? buildResponsesRequestBody(context, stream) : buildChatRequestBody(context, stream);
  return fetch(`${context.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${context.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

/**
 * Throws a descriptive error if the provider rejected the request.
 *
 * Both transports need this. A streaming request that skips the check reads an error body that
 * contains no `data:` lines, so it emits nothing and looks like an empty but successful answer.
 * @param response - The provider's response
 * @throws An error carrying the HTTP status, for callers that map it onto their own response
 */
async function throwIfNotOk(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }
  const errorData = await response.json().catch(() => ({}));
  const error = new Error(
    `OpenAI API error: ${response.status} ${response.statusText} - ${errorData?.error?.message || 'Unknown error'}`
  );
  (error as Error & { statusCode: number }).statusCode = response.status;
  throw error;
}

/**
 * Accumulates streamed tool call deltas into `acc`, keyed by the delta's index.
 * @param acc - Sparse array of in-progress tool calls, indexed as the provider indexes them
 * @param deltas - The `delta.tool_calls` entries from a single SSE chunk
 */
function accumulateToolCallDeltas(acc: StreamedToolCall[], deltas: unknown[]): void {
  for (const delta of deltas) {
    if (!isObject(delta)) {
      continue;
    }
    // A fragment with no usable index belongs to the first call, which is all a stream with a
    // single tool call ever has. An unusable index would otherwise land on a non-element key
    // and be dropped silently.
    const index =
      typeof delta.index === 'number' && Number.isInteger(delta.index) && delta.index >= 0 ? delta.index : 0;
    acc[index] ??= { arguments: '' };
    const call = acc[index];
    const fn = isObject(delta.function) ? delta.function : undefined;
    if (typeof delta.id === 'string') {
      call.id = delta.id;
    }
    if (typeof delta.type === 'string') {
      call.type = delta.type;
    }
    if (typeof fn?.name === 'string') {
      call.name = fn.name;
    }
    if (typeof fn?.arguments === 'string') {
      call.arguments += fn.arguments;
    }
  }
}

/**
 * Converts accumulated stream deltas into the shared tool call type.
 * @param acc - Sparse array of accumulated tool calls
 * @returns The completed tool calls
 */
function toAiToolCalls(acc: StreamedToolCall[]): AiToolCall[] {
  return acc.filter(Boolean).map((call) => ({
    id: call.id,
    type: call.type ?? 'function',
    function: { name: call.name, arguments: parseArguments(call.arguments) },
  }));
}

/**
 * Reads a Responses API `function_call` output item into the shared tool call type.
 *
 * The item's `call_id` becomes the tool call `id`: that is the value a caller echoes back as
 * `tool_call_id` on the next turn, and {@link toResponsesInput} maps it back to `call_id`.
 * @param item - An output item of type `function_call`
 * @returns The tool call
 */
function toAiToolCallFromItem(item: Record<string, unknown>): AiToolCall {
  return {
    id: typeof item.call_id === 'string' ? item.call_id : undefined,
    type: 'function',
    function: {
      name: typeof item.name === 'string' ? item.name : undefined,
      arguments: parseArguments(typeof item.arguments === 'string' ? item.arguments : ''),
    },
  };
}

/**
 * Calls OpenAI and returns the complete response.
 * @param context - The request and its credentials
 * @returns The model's content and any tool calls it requested
 */
export async function callOpenAi(context: AiContext): Promise<AiResult> {
  const api = selectApi(context);
  const response = await postRequest(context, api, false);
  await throwIfNotOk(response);
  const payload = await response.json();
  return api === 'responses' ? parseResponsesResult(payload) : parseCompletion(payload);
}

/**
 * Reads the model's answer out of a chat-completions payload.
 *
 * Every field is checked rather than trusted: content that is not a string would otherwise reach
 * the FHIR response as an unusable `valueString`, and a tool call missing its `function` would
 * throw a `TypeError` far from its cause.
 * @param completion - The parsed response body
 * @returns The model's content and any tool calls it requested
 * @throws If the payload carries no message at all
 */
function parseCompletion(completion: unknown): AiResult {
  const choice = isObject(completion) && Array.isArray(completion.choices) ? completion.choices[0] : undefined;
  const message = isObject(choice) ? choice.message : undefined;
  if (!isObject(message)) {
    throw new Error('OpenAI response contained no choices');
  }

  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  return {
    provider: PROVIDER_CHAT,
    raw: completion,
    content: typeof message.content === 'string' ? message.content : null,
    toolCalls: toolCalls.filter(isObject).map((toolCall) => {
      const fn = isObject(toolCall.function) ? toolCall.function : undefined;
      return {
        id: typeof toolCall.id === 'string' ? toolCall.id : undefined,
        type: typeof toolCall.type === 'string' ? toolCall.type : 'function',
        function: {
          name: typeof fn?.name === 'string' ? fn.name : undefined,
          arguments: parseArguments(typeof fn?.arguments === 'string' ? fn.arguments : ''),
        },
      };
    }),
  };
}

/**
 * Reads the model's answer out of a Responses API payload.
 *
 * The answer is a list of output items rather than a single message: `message` items carry text
 * in `output_text` parts, `function_call` items carry tool calls, and `reasoning` items carry
 * nothing a caller acts on. Text from every message item is concatenated so a caller sees one
 * `content`, as it would from chat-completions.
 * @param payload - The parsed response body
 * @returns The model's content and any tool calls it requested
 * @throws If the payload carries no output at all
 */
function parseResponsesResult(payload: unknown): AiResult {
  const output = isObject(payload) && Array.isArray(payload.output) ? payload.output : undefined;
  if (!output) {
    throw new Error('OpenAI response contained no output');
  }

  let content = '';
  const toolCalls: AiToolCall[] = [];
  for (const item of output) {
    if (!isObject(item)) {
      continue;
    }
    if (item.type === 'function_call') {
      toolCalls.push(toAiToolCallFromItem(item));
    } else if (item.type === 'message' && Array.isArray(item.content)) {
      for (const part of item.content) {
        if (isObject(part) && part.type === 'output_text' && typeof part.text === 'string') {
          content += part.text;
        }
      }
    }
  }

  return {
    provider: PROVIDER_RESPONSES,
    raw: payload,
    content: content === '' ? null : content,
    toolCalls,
  };
}

/**
 * Reads an SSE body and hands every parsed `data:` payload to `onData`, in order.
 *
 * Shared by both endpoints: the framing is the same, only the payloads differ. The `[DONE]`
 * sentinel chat-completions ends with is dropped here. A payload that fails to parse is logged
 * and skipped, so one bad frame does not end the stream.
 * @param response - The provider's streaming response
 * @param onData - Called with each parsed payload
 */
async function readSse(response: Response, onData: (parsed: unknown) => void): Promise<void> {
  if (!response.body) {
    throw new Error('No response body available for streaming');
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += value;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) {
          continue;
        }
        const data = line.slice(6).trim();
        if (data === '[DONE]') {
          continue;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          getLogger().error('Error parsing SSE data:', { error: e });
          continue;
        }
        onData(parsed);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Calls OpenAI and reports the response as it arrives.
 *
 * `content` events are emitted as their deltas arrive. Tool calls cannot be emitted
 * incrementally because they are only actionable once complete, so their fragments are
 * accumulated and emitted as a single `tool_calls` event once the stream ends. A turn may
 * therefore produce content, tool calls, or both — letting an agent loop stream its final
 * answer on the same call that discovers it has no more tools to run. Each parsed chunk is also
 * reported as a `raw` event; a chunk that fails to parse is logged and reported as neither.
 * @param context - The request and its credentials
 * @param onEvent - Called for each event, in the order the provider produces them
 */
export async function streamOpenAi(context: AiContext, onEvent: (event: AiStreamEvent) => void): Promise<void> {
  const api = selectApi(context);
  const response = await postRequest(context, api, true);
  await throwIfNotOk(response);
  if (api === 'responses') {
    await streamResponses(response, onEvent);
  } else {
    await streamChat(response, onEvent);
  }
}

/**
 * Normalizes a chat-completions SSE stream, where every chunk is a `choices[0].delta`.
 * @param response - The provider's streaming response
 * @param onEvent - Called for each event, in the order the provider produces them
 */
async function streamChat(response: Response, onEvent: (event: AiStreamEvent) => void): Promise<void> {
  const toolCalls: StreamedToolCall[] = [];

  await readSse(response, (parsed) => {
    const choice = isObject(parsed) && Array.isArray(parsed.choices) ? parsed.choices[0] : undefined;
    const delta = isObject(choice) && isObject(choice.delta) ? choice.delta : undefined;

    if (Array.isArray(delta?.tool_calls)) {
      accumulateToolCallDeltas(toolCalls, delta.tool_calls);
    }

    if (typeof delta?.content === 'string' && delta.content !== '') {
      onEvent({ type: 'content', text: delta.content });
    }

    // Reported after the events derived from it, so a caller that only reads normalized
    // events sees them in the same order it would without raw passthrough. Chunks that
    // carry no delta at all — a usage summary, a keep-alive — reach the caller only here.
    onEvent({ type: 'raw', chunk: parsed });
  });

  if (toolCalls.length > 0) {
    onEvent({ type: 'tool_calls', toolCalls: toAiToolCalls(toolCalls) });
  }
}

/**
 * Normalizes a Responses API SSE stream, where each frame is a typed event.
 *
 * `response.output_text.delta` carries text. A tool call arrives whole in
 * `response.output_item.done`, so no fragment reassembly is needed. `response.failed` and
 * `error` end the stream with a thrown error, which the caller reports in-band; the 200 is
 * already on the wire by then. Everything else — reasoning summaries, item lifecycle, the final
 * `response.completed` with usage — reaches the caller only as `raw`.
 * @param response - The provider's streaming response
 * @param onEvent - Called for each event, in the order the provider produces them
 */
async function streamResponses(response: Response, onEvent: (event: AiStreamEvent) => void): Promise<void> {
  const toolCalls: AiToolCall[] = [];

  await readSse(response, (parsed) => {
    if (!isObject(parsed)) {
      return;
    }

    if (parsed.type === 'response.failed' || parsed.type === 'error') {
      const detail = isObject(parsed.response) && isObject(parsed.response.error) ? parsed.response.error : parsed;
      const message = isObject(detail) && typeof detail.message === 'string' ? detail.message : 'Unknown error';
      throw new Error(`OpenAI API error: ${message}`);
    }

    if (parsed.type === 'response.output_text.delta' && typeof parsed.delta === 'string' && parsed.delta !== '') {
      onEvent({ type: 'content', text: parsed.delta });
    }

    if (parsed.type === 'response.output_item.done' && isObject(parsed.item) && parsed.item.type === 'function_call') {
      toolCalls.push(toAiToolCallFromItem(parsed.item));
    }

    onEvent({ type: 'raw', chunk: parsed });
  });

  if (toolCalls.length > 0) {
    onEvent({ type: 'tool_calls', toolCalls });
  }
}
