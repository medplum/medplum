// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Message } from '../types/spaces';
import { processMessage, sendToBotStreaming } from './spaceMessaging';

vi.mock('./spacePersistence', () => ({
  createConversationTopic: vi.fn().mockResolvedValue({ id: 'topic-1', resourceType: 'Communication' }),
  saveMessage: vi.fn().mockResolvedValue(undefined),
}));

// Helper to create a mock streaming SSE response
function createMockStreamingResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  let chunkIndex = 0;

  const stream = new ReadableStream({
    pull(controller) {
      if (chunkIndex < chunks.length) {
        const sseData = `data: ${JSON.stringify({ content: chunks[chunkIndex] })}\n\n`;
        controller.enqueue(encoder.encode(sseData));
        chunkIndex++;
      } else {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

// Helper to create a mock buffered JSON response
function createMockBufferedResponse(content: string): Response {
  return new Response(
    JSON.stringify({
      resourceType: 'Parameters',
      parameter: [{ name: 'content', valueString: content }],
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/fhir+json' },
    }
  );
}

// Helper to create a mock error response
function createMockErrorResponse(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain' },
  });
}

describe('sendToBotStreaming', () => {
  let mockMedplum: Partial<MedplumClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMedplum = {
      getAccessToken: vi.fn().mockReturnValue('mock-token'),
      fhirUrl: vi.fn().mockReturnValue(new URL('https://api.medplum.com/fhir/R4/Bot/bot-1/$execute')),
      searchOne: vi.fn().mockResolvedValue({ resourceType: 'Bot', id: 'bot-1' }),
    };
  });

  const botId = {
    system: 'https://www.medplum.com/bots',
    value: 'test-bot',
  };

  const messages = [{ role: 'user' as const, content: 'Hello' }];

  test('handles streaming SSE response with multiple chunks', async () => {
    const chunks = ['Hello', ' world', '!'];
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(createMockStreamingResponse(chunks));

    const receivedChunks: string[] = [];
    const result = await sendToBotStreaming(
      mockMedplum as MedplumClient,
      botId,
      messages,
      'gpt-4o',
      'medium',
      (chunk) => receivedChunks.push(chunk)
    );

    expect(result.content).toBe('Hello world!');
    expect(receivedChunks).toEqual(['Hello', ' world', '!']);
  });

  test('handles buffered JSON response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(createMockBufferedResponse('This is a buffered response'));

    const receivedChunks: string[] = [];
    const result = await sendToBotStreaming(
      mockMedplum as MedplumClient,
      botId,
      messages,
      'gpt-4o',
      'medium',
      (chunk) => receivedChunks.push(chunk)
    );

    expect(result.content).toBe('This is a buffered response');
    expect(receivedChunks).toEqual(['This is a buffered response']);
  });

  test('throws error when bot execution returns 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(createMockErrorResponse(404, 'Bot not found'));

    await expect(
      sendToBotStreaming(mockMedplum as MedplumClient, botId, messages, 'gpt-4o', 'medium', vi.fn())
    ).rejects.toThrow('Bot execution failed: 404 - Bot not found');
  });

  test('throws error when fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(createMockErrorResponse(500, 'Internal Server Error'));

    await expect(
      sendToBotStreaming(mockMedplum as MedplumClient, botId, messages, 'gpt-4o', 'medium', vi.fn())
    ).rejects.toThrow('Bot execution failed: 500 - Internal Server Error');
  });

  test('throws error when response body is null for streaming', async () => {
    const mockResponse = new Response(null, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
    Object.defineProperty(mockResponse, 'body', { value: null });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

    await expect(
      sendToBotStreaming(mockMedplum as MedplumClient, botId, messages, 'gpt-4o', 'medium', vi.fn())
    ).rejects.toThrow('No response body');
  });

  test('sends correct request headers and body', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(createMockBufferedResponse('OK'));

    await sendToBotStreaming(mockMedplum as MedplumClient, botId, messages, 'gpt-4o', 'medium', vi.fn());

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.medplum.com/fhir/R4/Bot/bot-1/$execute',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer mock-token',
          'Content-Type': 'application/fhir+json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          resourceType: 'Parameters',
          parameter: [
            { name: 'messages', valueString: JSON.stringify(messages) },
            { name: 'model', valueString: 'gpt-4o' },
            { name: 'reasoning_effort', valueString: 'medium' },
          ],
        }),
      })
    );
  });

  test('handles empty content in buffered response', async () => {
    const response = new Response(
      JSON.stringify({
        resourceType: 'Parameters',
        parameter: [],
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/fhir+json' },
      }
    );
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response);

    const receivedChunks: string[] = [];
    const result = await sendToBotStreaming(
      mockMedplum as MedplumClient,
      botId,
      messages,
      'gpt-4o',
      'medium',
      (chunk) => receivedChunks.push(chunk)
    );

    expect(result.content).toBe('');
    expect(receivedChunks).toEqual([]);
  });

  test('handles SSE with OpenAI delta format', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'));
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":" there"}}]}\n\n'));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    const response = new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response);

    const receivedChunks: string[] = [];
    const result = await sendToBotStreaming(
      mockMedplum as MedplumClient,
      botId,
      messages,
      'gpt-4o',
      'medium',
      (chunk) => receivedChunks.push(chunk)
    );

    expect(result.content).toBe('Hello there');
    expect(receivedChunks).toEqual(['Hello', ' there']);
  });

  test('ignores malformed JSON in SSE stream', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"content":"Hello"}\n\n'));
        controller.enqueue(encoder.encode('data: not valid json\n\n'));
        controller.enqueue(encoder.encode('data: {"content":" world"}\n\n'));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    const response = new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response);

    const receivedChunks: string[] = [];
    const result = await sendToBotStreaming(
      mockMedplum as MedplumClient,
      botId,
      messages,
      'gpt-4o',
      'medium',
      (chunk) => receivedChunks.push(chunk)
    );

    expect(result.content).toBe('Hello world');
    expect(receivedChunks).toEqual(['Hello', ' world']);
  });

  test('handles SSE with empty data lines', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"content":"Hello"}\n\n'));
        controller.enqueue(encoder.encode('\n\n'));
        controller.enqueue(encoder.encode('data: \n\n'));
        controller.enqueue(encoder.encode('data: {"content":" world"}\n\n'));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    const response = new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response);

    const receivedChunks: string[] = [];
    const result = await sendToBotStreaming(
      mockMedplum as MedplumClient,
      botId,
      messages,
      'gpt-4o',
      'medium',
      (chunk) => receivedChunks.push(chunk)
    );

    expect(result.content).toBe('Hello world');
  });
});

describe('processMessage', () => {
  const userMessage: Message = { role: 'user', content: 'Show me the patient list' };
  const baseOptions = {
    messages: [] as Message[],
    userMessage,
    topicId: 'topic-1',
    model: 'gpt-4o',
    reasoningEffort: 'medium' as const,
  };

  function makeMockMedplum(executeBotImpl: () => unknown): MedplumClient {
    return {
      getAccessToken: vi.fn().mockReturnValue('mock-token'),
      fhirUrl: vi.fn().mockReturnValue(new URL('https://api.medplum.com/fhir/R4')),
      searchOne: vi.fn().mockResolvedValue({ resourceType: 'Bot', id: 'bot-1' }),
      executeBot: vi.fn().mockImplementation(executeBotImpl),
      get: vi.fn().mockResolvedValue({
        resourceType: 'Bundle',
        entry: [{ resource: { resourceType: 'Patient', id: 'p-1' } }],
      }),
    } as unknown as MedplumClient;
  }

  function makeBotResponse(opts: { toolCalls?: unknown[]; content?: string } = {}): unknown {
    const params = [];
    if (opts.content) {
      params.push({ name: 'content', valueString: opts.content });
    }
    if (opts.toolCalls) {
      params.push({ name: 'tool_calls', valueString: JSON.stringify(opts.toolCalls) });
    }
    return { resourceType: 'Parameters', parameter: params };
  }

  const stubToolCall = {
    id: 'call-1',
    function: { name: 'fhir_request', arguments: JSON.stringify({ method: 'GET', path: 'Patient' }) },
  };

  // Translator returns a tool call on the first call and a final answer on the second.
  function toolThenAnswer(): MedplumClient {
    let calls = 0;
    return makeMockMedplum(() => {
      calls++;
      return Promise.resolve(
        calls === 1 ? makeBotResponse({ toolCalls: [stubToolCall] }) : makeBotResponse({ content: 'Final answer.' })
      );
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(createMockBufferedResponse('Summary.'));
  });

  test('returns AI summary with note when loop hits max iterations and tools ran', async () => {
    const medplum = makeMockMedplum(() => Promise.resolve(makeBotResponse({ toolCalls: [stubToolCall] })));
    vi.mocked(fetch).mockResolvedValue(createMockBufferedResponse('Here is what I found so far: 10 patients.'));

    const result = await processMessage({ ...baseOptions, medplum });

    expect(medplum.executeBot).toHaveBeenCalledTimes(10);
    expect(result.assistantMessage.content).toContain('Here is what I found so far: 10 patients.');
    expect(result.assistantMessage.content).toContain('processing limit');
    expect(result.assistantMessage.content).toContain('more specific question');
  });

  test('returns the fallback text when the bot answers with nothing', async () => {
    const medplum = makeMockMedplum(() => Promise.resolve(makeBotResponse({})));

    const result = await processMessage({ ...baseOptions, medplum });

    expect(fetch).not.toHaveBeenCalled();
    expect(result.assistantMessage.content).toBe(
      'I received your message but was unable to generate a response. Please try again.'
    );
  });

  test('summarizes the tool results when the bot finishes before max iterations', async () => {
    const result = await processMessage({ ...baseOptions, medplum: toolThenAnswer() });

    expect(result.assistantMessage.content).toBe('Summary.');
    expect(result.assistantMessage.content).not.toContain('processing limit');
    expect(result.assistantMessage.resources).toEqual(['Patient/p-1']);
  });
});
