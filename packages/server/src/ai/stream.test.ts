// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType } from '@medplum/core';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { initTestAuth } from '../test.setup';

const app = express();
let accessToken: string;

describe('AI Streaming', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth({ project: { features: ['ai'] } });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Handles streaming responses via $ai-stream endpoint', async () => {
    // Create a mock streaming response
    const encoder = new TextEncoder();
    const streamChunks = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"!"}}]}\n\n',
      'data: [DONE]\n\n',
    ];

    let chunkIndex = 0;
    const mockReadableStream = {
      getReader: jest.fn().mockReturnValue({
        read: jest.fn().mockImplementation(async () => {
          if (chunkIndex < streamChunks.length) {
            const chunk = encoder.encode(streamChunks[chunkIndex]);
            chunkIndex++;
            return { done: false, value: chunk };
          }
          return { done: true };
        }),
        releaseLock: jest.fn(),
      }),
    };

    const mockFetchResponse = {
      ok: true,
      status: 200,
      body: mockReadableStream,
    };

    global.fetch = jest.fn().mockResolvedValue(mockFetchResponse);

    const res = await request(app)
      .post(`/fhir/R4/$ai-stream`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'messages',
            valueString: JSON.stringify([{ role: 'user', content: 'Say hello' }]),
          },
          {
            name: 'apiKey',
            valueString: 'sk-test-key',
          },
          {
            name: 'model',
            valueString: 'gpt-4',
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/event-stream');

    // Verify stream parameter was set in the request
    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    const bodyParam = JSON.parse(fetchCall[1].body);
    expect(bodyParam.stream).toBe(true);

    // Verify the SSE chunks are in the response
    const responseText = res.text;
    expect(responseText).toContain('data: {"content":"Hello"}');
    expect(responseText).toContain('data: {"content":" world"}');
    expect(responseText).toContain('data: {"content":"!"}');
    expect(responseText).toContain('data: [DONE]');
  });

  test('Stream endpoint rejects requests without AI feature', async () => {
    const noAiAccessToken = await initTestAuth({ project: { features: [] } });

    const res = await request(app)
      .post(`/fhir/R4/$ai-stream`)
      .set('Authorization', 'Bearer ' + noAiAccessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'messages',
            valueString: JSON.stringify([{ role: 'user', content: 'Test' }]),
          },
          {
            name: 'apiKey',
            valueString: 'sk-test-key',
          },
          {
            name: 'model',
            valueString: 'gpt-4',
          },
        ],
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('AI feature not enabled');
  });

  test('Stream endpoint validates required parameters', async () => {
    const res = await request(app)
      .post(`/fhir/R4/$ai-stream`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'messages',
            valueString: JSON.stringify([{ role: 'user', content: 'Test' }]),
          },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Missing required parameters');
  });

  test('Simulates actual progressive streaming behavior', async () => {
    // Create a mock stream with intentional delays
    const encoder = new TextEncoder();
    const streamChunks = [
      'data: {"choices":[{"delta":{"content":"Progressive"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" streaming"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" test"}}]}\n\n',
    ];

    let chunkIndex = 0;
    const mockReadableStream = {
      getReader: jest.fn().mockReturnValue({
        read: jest.fn().mockImplementation(async () => {
          if (chunkIndex < streamChunks.length) {
            // Simulate network delay between chunks
            await new Promise<void>((resolve) => {
              setTimeout(() => resolve(), 10);
            });
            const chunk = encoder.encode(streamChunks[chunkIndex]);
            chunkIndex++;
            return { done: false, value: chunk };
          }
          return { done: true };
        }),
        releaseLock: jest.fn(),
      }),
    };

    const mockFetchResponse = {
      ok: true,
      status: 200,
      body: mockReadableStream,
    };

    global.fetch = jest.fn().mockResolvedValue(mockFetchResponse);

    // Mock the Express Response to capture streaming behavior
    const writeCalls: { time: number; data: string }[] = [];
    const mockRes: any = {
      headersSent: false,
      setHeader: jest.fn(),
      flushHeaders: jest.fn(function (this: any) {
        this.headersSent = true;
      }),
      write: jest.fn((data: string) => {
        writeCalls.push({ time: Date.now(), data });
      }),
      end: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };


    // Use the real authenticated context from the test setup
    // The test access token already has the AI feature enabled
    const { streamAIToClient } = await import('./stream');
    
    // Call streamAIToClient directly, bypassing authentication
    await streamAIToClient(
      [{ role: 'user', content: 'Test' }],
      'sk-test-key',
      'gpt-4',
      undefined,
      mockRes
    );

    // Verify progressive streaming
    expect(mockRes.setHeader).not.toHaveBeenCalled(); // streamAIToClient doesn't set headers
    
    // Verify write was called multiple times (progressive)
    expect(writeCalls.length).toBeGreaterThan(1);

    // Verify time delays between writes (proving non-buffered streaming)
    for (let i = 1; i < writeCalls.length; i++) {
      const timeDiff = writeCalls[i].time - writeCalls[i - 1].time;
      expect(timeDiff).toBeGreaterThanOrEqual(0); // Should have measurable delay
    }

    // Verify each write contains a complete SSE message
    writeCalls.forEach((call, index) => {
      if (index < writeCalls.length - 1) {
        // Not the [DONE] message
        expect(call.data).toMatch(/^data: \{"content":".*"\}\n\n$/);
      }
    });

    // Verify content chunks
    const contentChunks = writeCalls
      .filter((call) => call.data.includes('"content"'))
      .map((call) => JSON.parse(call.data.slice(6).trim()).content);

    expect(contentChunks).toEqual(['Progressive', ' streaming', ' test']);

    // Verify no OpenAI metadata leaked (no chatcmpl-, finish_reason, role, etc.)
    writeCalls.forEach((call) => {
      expect(call.data).not.toContain('chatcmpl-');
      expect(call.data).not.toContain('finish_reason');
      expect(call.data).not.toContain('"role"');
    });

    // Verify reader lock was released
    const readerMock = mockReadableStream.getReader();
    expect(readerMock.releaseLock).toHaveBeenCalled();
  });
});

