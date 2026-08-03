// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getLogger } from '../logger';
import type { AiContext, AiResult, AiStreamEvent, AiToolCall } from './types';

/**
 * The OpenAI chat-completions provider.
 *
 * Everything specific to OpenAI's wire format lives here: request body shape, the
 * `/chat/completions` endpoint, and SSE delta parsing. Callers work in terms of
 * {@link AiResult} and {@link AiStreamEvent} and never see an OpenAI payload, so a second
 * provider only has to translate its own format to those types.
 *
 * Also serves any OpenAI-compatible API, such as a LiteLLM proxy pointed at by `LLM_BASE_URL`.
 */

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
 * @returns The parsed value, or `raw` unchanged if it is not valid JSON
 */
function parseArguments(raw: string): unknown {
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
function buildRequestBody(context: AiContext, stream: boolean): any {
  const requestBody: any = {
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
function accumulateToolCallDeltas(acc: StreamedToolCall[], deltas: any[]): void {
  for (const delta of deltas) {
    const index = delta.index ?? 0;
    acc[index] ??= { arguments: '' };
    const call = acc[index];
    if (delta.id) {
      call.id = delta.id;
    }
    if (delta.type) {
      call.type = delta.type;
    }
    if (delta.function?.name) {
      call.name = delta.function.name;
    }
    if (delta.function?.arguments) {
      call.arguments += delta.function.arguments;
    }
  }
}

/**
 * Converts accumulated stream deltas into the shared tool call type.
 * @param acc - Sparse array of accumulated tool calls
 * @returns The completed tool calls
 */
function toAiToolCalls(acc: StreamedToolCall[]): AiToolCall[] {
  return acc
    .filter((call) => call)
    .map((call) => ({
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

  const completion = await response.json();
  const message = completion.choices?.[0]?.message;
  if (!message) {
    throw new Error('OpenAI response contained no choices');
  }

  return {
    content: message.content,
    toolCalls: ((message.tool_calls || []) as any[]).map((toolCall) => ({
      id: toolCall.id,
      type: toolCall.type ?? 'function',
      function: { name: toolCall.function.name, arguments: parseArguments(toolCall.function.arguments) },
    })),
  };
}

/**
 * Calls OpenAI and reports the response as it arrives.
 *
 * `content` events are emitted as their deltas arrive. Tool calls cannot be emitted
 * incrementally because they are only actionable once complete, so their fragments are
 * accumulated and emitted as a single `tool_calls` event once the stream ends. A turn may
 * therefore produce content, tool calls, or both — letting an agent loop stream its final
 * answer on the same call that discovers it has no more tools to run.
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
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;

            if (delta?.tool_calls) {
              accumulateToolCallDeltas(toolCalls, delta.tool_calls);
            }

            if (!delta?.content) {
              continue;
            }

            onEvent({ type: 'content', text: delta.content });
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
