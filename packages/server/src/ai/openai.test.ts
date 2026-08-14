// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Mock } from 'vitest';
import { vi } from 'vitest';
import type { AiContext } from './openai';
import { callOpenAi, streamOpenAi } from './openai';

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

      const result = await callOpenAi({ ...baseContext, tools: fhirTools, temperature: 0.3 });

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
});
