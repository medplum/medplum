// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { sendToBotStreaming } from './spaceMessaging';

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
      fhirUrl: vi.fn().mockReturnValue(new URL('https://api.medplum.com/fhir/R4/Bot/$execute')),
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
    const result = await sendToBotStreaming(mockMedplum as MedplumClient, botId, messages, 'gpt-4o', (chunk) =>
      receivedChunks.push(chunk)
    );

    expect(result.content).toBe('Hello world!');
    expect(receivedChunks).toEqual(['Hello', ' world', '!']);
  });

  test('handles buffered JSON response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(createMockBufferedResponse('This is a buffered response'));

    const receivedChunks: string[] = [];
    const result = await sendToBotStreaming(mockMedplum as MedplumClient, botId, messages, 'gpt-4o', (chunk) =>
      receivedChunks.push(chunk)
    );

    expect(result.content).toBe('This is a buffered response');
    expect(receivedChunks).toEqual(['This is a buffered response']);
  });

  test('throws error when bot execution returns 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(createMockErrorResponse(404, 'Bot not found'));

    await expect(sendToBotStreaming(mockMedplum as MedplumClient, botId, messages, 'gpt-4o', vi.fn())).rejects.toThrow(
      'Bot execution failed: 404 - Bot not found'
    );
  });

  test('throws error when fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(createMockErrorResponse(500, 'Internal Server Error'));

    await expect(sendToBotStreaming(mockMedplum as MedplumClient, botId, messages, 'gpt-4o', vi.fn())).rejects.toThrow(
      'Bot execution failed: 500 - Internal Server Error'
    );
  });

  test('throws error when response body is null for streaming', async () => {
    const mockResponse = new Response(null, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
    Object.defineProperty(mockResponse, 'body', { value: null });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

    await expect(sendToBotStreaming(mockMedplum as MedplumClient, botId, messages, 'gpt-4o', vi.fn())).rejects.toThrow(
      'No response body'
    );
  });

  test('sends correct request headers and body', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(createMockBufferedResponse('OK'));

    await sendToBotStreaming(mockMedplum as MedplumClient, botId, messages, 'gpt-4o', vi.fn());

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.medplum.com/fhir/R4/Bot/$execute?identifier=https%3A%2F%2Fwww.medplum.com%2Fbots%7Ctest-bot',
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
    const result = await sendToBotStreaming(mockMedplum as MedplumClient, botId, messages, 'gpt-4o', (chunk) =>
      receivedChunks.push(chunk)
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
    const result = await sendToBotStreaming(mockMedplum as MedplumClient, botId, messages, 'gpt-4o', (chunk) =>
      receivedChunks.push(chunk)
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
    const result = await sendToBotStreaming(mockMedplum as MedplumClient, botId, messages, 'gpt-4o', (chunk) =>
      receivedChunks.push(chunk)
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
    const result = await sendToBotStreaming(mockMedplum as MedplumClient, botId, messages, 'gpt-4o', (chunk) =>
      receivedChunks.push(chunk)
    );

    expect(result.content).toBe('Hello world');
  });
});
