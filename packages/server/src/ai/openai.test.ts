// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Mock } from 'vitest';
import { vi } from 'vitest';
import type { AiContext } from './openai';
import { callOpenAi, selectApi, streamOpenAi } from './openai';

/** The event `streamOpenAi` reports, derived so the provider need not export the type. */
type StreamEvent = Parameters<Parameters<typeof streamOpenAi>[1]>[0];

const baseContext: AiContext = {
  messages: [{ role: 'user', content: 'Find Frodo' }],
  model: 'gpt-4',
  apiKey: 'sk-test-key',
  baseUrl: 'https://api.openai.com/v1',
};

const fhirTools = [
  {
    type: 'function',
    function: {
      name: 'fhir_request',
      parameters: {
        type: 'object',
        properties: { method: { type: 'string' }, path: { type: 'string' } },
        required: ['method', 'path'],
      },
    },
  },
];

/**
 * Builds a mock fetch response that yields `chunks` from the SSE reader, one read at a time.
 * @param chunks - Raw SSE text to emit, in order
 * @returns A mock fetch response shaped like a streaming fetch result
 */
function mockSseStream(chunks: string[]): object {
  let index = 0;
  return {
    ok: true,
    status: 200,
    body: {
      pipeThrough: vi.fn().mockReturnValue({
        getReader: vi.fn().mockReturnValue({
          read: vi.fn().mockImplementation(async () => {
            if (index < chunks.length) {
              return { done: false, value: chunks[index++] };
            }
            return { done: true, value: undefined };
          }),
          releaseLock: vi.fn(),
        }),
      }),
    },
  };
}

/**
 * Runs a streaming call and collects every event the provider emits.
 * @param chunks - Raw SSE text the provider will read
 * @param context - Optional context overrides
 * @returns The emitted events, in order
 */
async function collectEvents(chunks: string[], context?: Partial<AiContext>): Promise<StreamEvent[]> {
  global.fetch = vi.fn().mockResolvedValue(mockSseStream(chunks));
  const events: StreamEvent[] = [];
  await streamOpenAi({ ...baseContext, ...context }, (event) => events.push(event));
  return events;
}

/**
 * Runs a streaming call and collects only the normalized events.
 * @param chunks - Raw SSE text the provider will read
 * @param context - Optional context overrides
 * @returns The emitted events with the verbatim `raw` copies dropped, in order
 */
async function collectNormalized(chunks: string[], context?: Partial<AiContext>): Promise<StreamEvent[]> {
  return (await collectEvents(chunks, context)).filter((event) => event.type !== 'raw');
}

describe('OpenAI provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('callOpenAi', () => {
    test('Returns content and parses tool call arguments', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: 'Here you go',
                tool_calls: [
                  {
                    id: 'call_123',
                    type: 'function',
                    function: { name: 'fhir_request', arguments: '{"method":"GET","path":"Patient"}' },
                  },
                ],
              },
            },
          ],
        }),
      });

      const result = await callOpenAi({ ...baseContext, tools: fhirTools, temperature: 0.3, reasoningEffort: 'none' });

      expect(result.content).toBe('Here you go');
      expect(result.toolCalls).toStrictEqual([
        {
          id: 'call_123',
          type: 'function',
          function: { name: 'fhir_request', arguments: { method: 'GET', path: 'Patient' } },
        },
      ]);

      const [url, init] = (global.fetch as Mock).mock.calls[0];
      expect(url).toBe('https://api.openai.com/v1/chat/completions');
      const body = JSON.parse(init.body);
      expect(body.model).toBe('gpt-4');
      expect(body.temperature).toBe(0.3);
      expect(body.reasoning_effort).toBe('none');
      expect(body.tools).toStrictEqual(fhirTools);
      expect(body.tool_choice).toBe('auto');
      expect(body.stream).toBeUndefined();
    });

    test('Returns an empty tool call list when the model requests none', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ choices: [{ message: { content: 'Just prose', tool_calls: null } }] }),
      });

      const result = await callOpenAi(baseContext);
      expect(result.content).toBe('Just prose');
      expect(result.toolCalls).toStrictEqual([]);
    });

    test('Throws when the response contains no choices', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ choices: [] }),
      });

      await expect(callOpenAi(baseContext)).rejects.toThrow('OpenAI response contained no choices');
    });

    test('Reads a call to a tool that takes no arguments as an empty object', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [{ id: 'call_now', type: 'function', function: { name: 'current_time', arguments: '' } }],
              },
            },
          ],
        }),
      });

      const result = await callOpenAi(baseContext);
      expect(result.toolCalls[0].function.arguments).toStrictEqual({});
    });

    test('Drops response fields that arrive in an unusable shape', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: { text: 'not a string' }, tool_calls: [{ id: 'call_bare' }] } }],
        }),
      });

      const result = await callOpenAi(baseContext);
      // An OpenAI-compatible proxy can send anything; nothing unusable reaches the caller, and a
      // tool call missing its `function` must not throw a TypeError on the way out
      expect(result.content).toBeNull();
      expect(result.toolCalls).toStrictEqual([
        { id: 'call_bare', type: 'function', function: { name: undefined, arguments: {} } },
      ]);
    });

    test('Throws with statusCode on a non-ok response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: vi.fn().mockResolvedValue({ error: { message: 'Rate limit reached' } }),
      });

      await expect(callOpenAi(baseContext)).rejects.toThrow(
        'OpenAI API error: 429 Too Many Requests - Rate limit reached'
      );

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: vi.fn().mockResolvedValue({ error: { message: 'Rate limit reached' } }),
      });
      // The status is surfaced for callers that map it onto an HTTP response
      await expect(callOpenAi(baseContext)).rejects.toMatchObject({ statusCode: 429 });
    });
  });

  describe('streamOpenAi', () => {
    test('Emits content events in order', async () => {
      const events = await collectNormalized([
        'data: {"choices":[{"delta":{"content":"Progressive"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" streaming"}}]}\n\n',
      ]);

      expect(events).toStrictEqual([
        { type: 'content', text: 'Progressive' },
        { type: 'content', text: ' streaming' },
      ]);
    });

    test('Sends stream and tools together', async () => {
      await collectEvents([], { tools: fhirTools });

      const body = JSON.parse((global.fetch as Mock).mock.calls[0][1].body);
      // Streaming and tool calling must not be mutually exclusive
      expect(body.stream).toBe(true);
      expect(body.tools).toStrictEqual(fhirTools);
      expect(body.tool_choice).toBe('auto');
    });

    test('Reassembles a tool call split across chunks, emitted last', async () => {
      const events = await collectNormalized(
        [
          'data: {"choices":[{"delta":{"content":"Looking"}}]}\n\n',
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_abc","type":"function","function":{"name":"fhir_request","arguments":""}}]}}]}\n\n',
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"method\\":\\"GET\\","}}]}}]}\n\n',
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"path\\":\\"Patient?name=Frodo\\"}"}}]}}]}\n\n',
        ],
        { tools: fhirTools }
      );

      // A tool call is only actionable once complete, so it lands after all content
      expect(events).toStrictEqual([
        { type: 'content', text: 'Looking' },
        {
          type: 'tool_calls',
          toolCalls: [
            {
              id: 'call_abc',
              type: 'function',
              function: { name: 'fhir_request', arguments: { method: 'GET', path: 'Patient?name=Frodo' } },
            },
          ],
        },
      ]);
    });

    test('Routes interleaved fragments to the call matching their index', async () => {
      const events = await collectNormalized(
        [
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_a","type":"function","function":{"name":"fhir_request","arguments":"{\\"path\\":"}}]}}]}\n\n',
          'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"id":"call_b","type":"function","function":{"name":"fhir_request","arguments":"{\\"path\\":"}}]}}]}\n\n',
          'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"function":{"arguments":"\\"Task\\"}"}},{"index":0,"function":{"arguments":"\\"Patient\\"}"}}]}}]}\n\n',
        ],
        { tools: fhirTools }
      );

      expect(events).toHaveLength(1);
      expect(events[0]).toStrictEqual({
        type: 'tool_calls',
        toolCalls: [
          { id: 'call_a', type: 'function', function: { name: 'fhir_request', arguments: { path: 'Patient' } } },
          { id: 'call_b', type: 'function', function: { name: 'fhir_request', arguments: { path: 'Task' } } },
        ],
      });
    });

    test('Passes through arguments that never became valid JSON', async () => {
      const events = await collectNormalized(
        [
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_cut","type":"function","function":{"name":"fhir_request","arguments":"{\\"method\\":\\"GET\\""}}]}}]}\n\n',
        ],
        { tools: fhirTools }
      );

      // A truncated fragment reaches the caller as-is rather than dropping the call
      expect(events).toStrictEqual([
        {
          type: 'tool_calls',
          toolCalls: [
            { id: 'call_cut', type: 'function', function: { name: 'fhir_request', arguments: '{"method":"GET"' } },
          ],
        },
      ]);
    });

    test('Derives no normalized event from a chunk that carries no choices', async () => {
      const events = await collectNormalized([
        'data: {"choices":[{"delta":{"content":"before"}}]}\n\n',
        'data: {"usage":{"prompt_tokens":10,"completion_tokens":2}}\n\n',
        'data: {"choices":[{"delta":{"content":"after"}}]}\n\n',
      ]);

      // A usage-only chunk must not abort the stream, and it normalizes to nothing
      expect(events).toStrictEqual([
        { type: 'content', text: 'before' },
        { type: 'content', text: 'after' },
      ]);
    });

    test('Reports every parsed chunk verbatim, including one that normalizes to nothing', async () => {
      const events = await collectEvents([
        'data: {"choices":[{"delta":{"content":"before"}},{"finish_reason":null}]}\n\n',
        'data: {"usage":{"prompt_tokens":10,"completion_tokens":2}}\n\n',
        'data: [DONE]\n\n',
      ]);

      // Whatever normalizing drops — a usage summary, a finish reason — is still reachable, and
      // each raw event follows the events derived from the same chunk
      expect(events).toStrictEqual([
        { type: 'content', text: 'before' },
        { type: 'raw', chunk: { choices: [{ delta: { content: 'before' } }, { finish_reason: null }] } },
        { type: 'raw', chunk: { usage: { prompt_tokens: 10, completion_tokens: 2 } } },
      ]);
    });

    test('Emits nothing for a stream with no chunks', async () => {
      expect(await collectEvents([])).toStrictEqual([]);
    });

    test('Throws with statusCode on a non-ok response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: vi.fn().mockResolvedValue({ error: { message: 'Incorrect API key provided' } }),
      });

      // Without this check the error body parses as zero SSE frames, so the caller sees an empty
      // but apparently successful stream.
      await expect(streamOpenAi(baseContext, () => undefined)).rejects.toThrow(
        'OpenAI API error: 401 Unauthorized - Incorrect API key provided'
      );
    });

    test('Throws when the response has no body', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, body: null });
      await expect(streamOpenAi(baseContext, () => undefined)).rejects.toThrow(
        'No response body available for streaming'
      );
    });
  });

  describe('selectApi', () => {
    test('Defaults to chat completions', () => {
      expect(selectApi(baseContext)).toBe('chat');
      expect(selectApi({ ...baseContext, tools: fhirTools })).toBe('chat');
      expect(selectApi({ ...baseContext, reasoningEffort: 'high' })).toBe('chat');
      expect(selectApi({ ...baseContext, tools: fhirTools, reasoningEffort: 'none' })).toBe('chat');
    });

    test('Routes tools with a reasoning effort to the Responses API', () => {
      expect(selectApi({ ...baseContext, tools: fhirTools, reasoningEffort: 'xhigh' })).toBe('responses');
    });

    test('An explicit api wins', () => {
      expect(selectApi({ ...baseContext, api: 'responses' })).toBe('responses');
      expect(selectApi({ ...baseContext, tools: fhirTools, reasoningEffort: 'high', api: 'chat' })).toBe('chat');
    });
  });

  describe('Responses API', () => {
    const responsesContext: AiContext = {
      ...baseContext,
      model: 'gpt-6-astra',
      tools: fhirTools,
      reasoningEffort: 'high',
      messages: [
        { role: 'system', content: 'Translate requests' },
        { role: 'user', content: 'Find Frodo' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'fhir_request', arguments: { method: 'GET', path: 'Patient' } },
            },
          ],
        },
        { role: 'tool', tool_call_id: 'call_1', content: '{"resourceType":"Bundle"}' },
      ],
    };

    test('Translates the request into Responses API form', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ output: [] }),
      });

      await callOpenAi({ ...responsesContext, temperature: 0.2 });

      const [url, init] = (global.fetch as Mock).mock.calls[0];
      expect(url).toBe('https://api.openai.com/v1/responses');
      const body = JSON.parse(init.body);
      expect(body.messages).toBeUndefined();
      expect(body.reasoning_effort).toBeUndefined();
      expect(body.model).toBe('gpt-6-astra');
      expect(body.store).toBe(false);
      expect(body.temperature).toBe(0.2);
      expect(body.reasoning).toStrictEqual({ effort: 'high' });
      expect(body.tool_choice).toBe('auto');
      expect(body.tools).toStrictEqual([
        {
          type: 'function',
          name: 'fhir_request',
          parameters: fhirTools[0].function.parameters,
        },
      ]);
      expect(body.input).toStrictEqual([
        { role: 'system', content: 'Translate requests' },
        { role: 'user', content: 'Find Frodo' },
        {
          type: 'function_call',
          call_id: 'call_1',
          name: 'fhir_request',
          arguments: '{"method":"GET","path":"Patient"}',
        },
        { type: 'function_call_output', call_id: 'call_1', output: '{"resourceType":"Bundle"}' },
      ]);
    });

    test('Reads content and tool calls out of output items', async () => {
      const payload = {
        output: [
          { type: 'reasoning', summary: [] },
          {
            type: 'message',
            content: [
              { type: 'output_text', text: 'Looking' },
              { type: 'output_text', text: ' it up' },
            ],
          },
          {
            type: 'function_call',
            call_id: 'call_9',
            name: 'fhir_request',
            arguments: '{"method":"GET","path":"Patient?name=Frodo"}',
          },
        ],
      };
      global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: vi.fn().mockResolvedValue(payload) });

      const result = await callOpenAi(responsesContext);

      expect(result.provider).toBe('openai-responses');
      expect(result.raw).toBe(payload);
      expect(result.content).toBe('Looking it up');
      expect(result.toolCalls).toStrictEqual([
        {
          id: 'call_9',
          type: 'function',
          function: { name: 'fhir_request', arguments: { method: 'GET', path: 'Patient?name=Frodo' } },
        },
      ]);
    });

    test('Returns null content when the model only called tools', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          output: [{ type: 'function_call', call_id: 'call_2', name: 'fhir_request', arguments: '' }],
        }),
      });

      const result = await callOpenAi(responsesContext);
      expect(result.content).toBeNull();
      expect(result.toolCalls[0].function.arguments).toStrictEqual({});
    });

    test('Throws when the response contains no output', async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue({ ok: true, status: 200, json: vi.fn().mockResolvedValue({ id: 'resp_1' }) });
      await expect(callOpenAi(responsesContext)).rejects.toThrow('OpenAI response contained no output');
    });

    test('Streams text deltas and emits whole tool calls last', async () => {
      const events = await collectNormalized(
        [
          'event: response.created\ndata: {"type":"response.created","response":{"id":"resp_1"}}\n\n',
          'data: {"type":"response.output_text.delta","delta":"Hello"}\n\n',
          'data: {"type":"response.output_item.done","item":{"type":"function_call","call_id":"call_3","name":"fhir_request","arguments":"{\\"method\\":\\"GET\\",\\"path\\":\\"Patient\\"}"}}\n\n',
          'data: {"type":"response.output_text.delta","delta":" there"}\n\n',
          'data: {"type":"response.completed","response":{"usage":{"total_tokens":12}}}\n\n',
        ],
        responsesContext
      );

      expect((global.fetch as Mock).mock.calls[0][0]).toBe('https://api.openai.com/v1/responses');
      expect(JSON.parse((global.fetch as Mock).mock.calls[0][1].body).stream).toBe(true);
      expect(events).toStrictEqual([
        { type: 'content', text: 'Hello' },
        { type: 'content', text: ' there' },
        {
          type: 'tool_calls',
          toolCalls: [
            {
              id: 'call_3',
              type: 'function',
              function: { name: 'fhir_request', arguments: { method: 'GET', path: 'Patient' } },
            },
          ],
        },
      ]);
    });

    test('Reports every parsed frame verbatim', async () => {
      const events = await collectEvents(
        ['data: {"type":"response.output_text.delta","delta":"Hi"}\n\ndata: {"type":"response.completed"}\n\n'],
        responsesContext
      );

      expect(events).toStrictEqual([
        { type: 'content', text: 'Hi' },
        { type: 'raw', chunk: { type: 'response.output_text.delta', delta: 'Hi' } },
        { type: 'raw', chunk: { type: 'response.completed' } },
      ]);
    });

    test('Throws when the stream reports a failure', async () => {
      await expect(
        collectEvents(
          ['data: {"type":"response.failed","response":{"error":{"message":"Rate limited"}}}\n\n'],
          responsesContext
        )
      ).rejects.toThrow('OpenAI API error: Rate limited');

      await expect(
        collectEvents(['data: {"type":"error","message":"Bad frame"}\n\n'], responsesContext)
      ).rejects.toThrow('OpenAI API error: Bad frame');
    });
  });
});
