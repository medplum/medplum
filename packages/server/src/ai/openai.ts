// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { isObject } from '@medplum/core';
import { getLogger } from '../logger';

/**
 * The OpenAI chat-completions provider.
 *
 * Everything specific to OpenAI's wire format lives here: request body shape, the
 * `/chat/completions` endpoint, and SSE delta parsing. Callers work in terms of
 * {@link AiResult} and {@link AiStreamEvent}, so a second provider only has to produce those
 * same types. Those types also carry the provider's payload verbatim, but only as an opt-in
 * extra alongside the normalized fields — nothing a caller needs in order to act on a response
 * requires reading it.
 *
 * Also serves any OpenAI-compatible API, such as a LiteLLM proxy pointed at by `LLM_BASE_URL`.
 * Such a proxy is under no obligation to send exactly what OpenAI sends, so responses are
 * treated as unknown JSON and checked field by field rather than cast into shape.
 */

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

/** Names this provider's schema in {@link AiResult.provider}, for callers that read `raw`. */
const PROVIDER = 'openai';

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
 * Builds the OpenAI request body.
 * @param context - The request and its credentials
 * @param stream - Whether to ask for a streamed response
 * @returns The request body to POST
 */
function buildRequestBody(context: AiContext, stream: boolean): Record<string, unknown> {
  const requestBody: Record<string, unknown> = {
    model: context.model,
    messages: context.messages,
  };

  if (context.temperature !== undefined) {
    requestBody.temperature = context.temperature;
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
 * The single outbound call to the provider. Both entry points funnel through here.
 * @param context - The request and its credentials
 * @param stream - Whether to ask for a streamed response
 * @returns The raw fetch response
 */
async function postChatCompletions(context: AiContext, stream: boolean): Promise<Response> {
  return fetch(`${context.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${context.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildRequestBody(context, stream)),
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
 * Calls OpenAI and returns the complete response.
 * @param context - The request and its credentials
 * @returns The model's content and any tool calls it requested
 */
export async function callOpenAi(context: AiContext): Promise<AiResult> {
  const response = await postChatCompletions(context, false);
  await throwIfNotOk(response);
  return parseCompletion(await response.json());
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
    provider: PROVIDER,
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
  const response = await postChatCompletions(context, true);
  await throwIfNotOk(response);
  if (!response.body) {
    throw new Error('No response body available for streaming');
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();

  let buffer = '';
  const toolCalls: StreamedToolCall[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        if (toolCalls.length > 0) {
          onEvent({ type: 'tool_calls', toolCalls: toAiToolCalls(toolCalls) });
        }
        break;
      }

      buffer += value;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();

          if (data === '[DONE]') {
            continue;
          }

          try {
            const parsed: unknown = JSON.parse(data);
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
          } catch (e) {
            // Skip malformed JSON
            getLogger().error('Error parsing SSE data:', { error: e });
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
