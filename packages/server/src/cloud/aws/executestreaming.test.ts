// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  InvokeCommand,
  InvokeWithResponseStreamCommand,
  LambdaClient,
  ListLayerVersionsCommand,
} from '@aws-sdk/client-lambda';
import { ContentType } from '@medplum/core';
import type { Bot } from '@medplum/fhirtypes';
import type { AwsClientStub } from 'aws-sdk-client-mock';
import { mockClient } from 'aws-sdk-client-mock';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { initTestAuth } from '../../test.setup';

const app = express();
let accessToken: string;
let bot: Bot;
let streamingBot: Bot;

describe('Execute', () => {
  let mockLambdaClient: AwsClientStub<LambdaClient>;

  beforeEach(() => {
    mockLambdaClient = mockClient(LambdaClient);

    mockLambdaClient.on(ListLayerVersionsCommand).resolves({
      LayerVersions: [
        {
          LayerVersionArn: 'xyz',
        },
      ],
    });

    mockLambdaClient.on(InvokeCommand).callsFake(({ Payload }) => {
      const decoder = new TextDecoder();
      const event = JSON.parse(decoder.decode(Payload));
      const output = JSON.stringify(event.input);
      const encoder = new TextEncoder();

      return {
        LogResult: `U1RBUlQgUmVxdWVzdElkOiAxNDZmY2ZjZi1jMzJiLTQzZjUtODJhNi1lZTBmMzEzMmQ4NzMgVmVyc2lvbjogJExBVEVTVAoyMDIyLTA1LTMwVDE2OjEyOjIyLjY4NVoJMTQ2ZmNmY2YtYzMyYi00M2Y1LTgyYTYtZWUwZjMxMzJkODczCUlORk8gdGVzdApFTkQgUmVxdWVzdElkOiAxNDZmY2ZjZi1jMzJiLTQzZjUtODJhNi1lZTBmMzEzMmQ4NzMKUkVQT1JUIFJlcXVlc3RJZDogMTQ2ZmNmY2YtYzMyYi00M2Y1LTgyYTYtZWUwZjMxMzJkODcz`,
        Payload: encoder.encode(output),
      };
    });

    // Mock for streaming invocation
    mockLambdaClient.on(InvokeWithResponseStreamCommand).callsFake(() => {
      const encoder = new TextEncoder();
      // Simulate streaming response: first line is headers JSON, then SSE data
      const headersLine = JSON.stringify({
        statusCode: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      });
      const dataChunks = ['data: Hello \n\n', 'data: World!\n\n'];

      // Create an async generator to simulate EventStream
      async function* createEventStream(): AsyncGenerator<{
        PayloadChunk?: { Payload: Uint8Array };
        InvokeComplete?: { LogResult?: string };
      }> {
        // Send headers line with newline
        yield { PayloadChunk: { Payload: encoder.encode(headersLine + '\n') } };
        // Send data chunks
        for (const chunk of dataChunks) {
          yield { PayloadChunk: { Payload: encoder.encode(chunk) } };
        }
        // Signal completion
        yield {
          InvokeComplete: {
            LogResult: `U1RBUlQgUmVxdWVzdElkOiAxNDZmY2ZjZi1jMzJiLTQzZjUtODJhNi1lZTBmMzEzMmQ4NzMgVmVyc2lvbjogJExBVEVTVAoyMDIyLTA1LTMwVDE2OjEyOjIyLjY4NVoJMTQ2ZmNmY2YtYzMyYi00M2Y1LTgyYTYtZWUwZjMxMzJkODczCUlORk8gdGVzdApFTkQgUmVxdWVzdElkOiAxNDZmY2ZjZi1jMzJiLTQzZjUtODJhNi1lZTBmMzEzMmQ4NzMKUkVQT1JUIFJlcXVlc3RJZDogMTQ2ZmNmY2YtYzMyYi00M2Y1LTgyYTYtZWUwZjMxMzJkODcz`,
          },
        };
      }

      return {
        EventStream: createEventStream(),
      };
    });
  });

  afterEach(() => {
    mockLambdaClient.restore();
  });

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth();

    const res = await request(app)
      .post(`/fhir/R4/Bot`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Bot',
        identifier: [{ system: 'https://example.com/bot', value: randomUUID() }],
        name: 'Test Bot',
        runtimeVersion: 'awslambda',
        code: `
          export async function handler(medplum, event) {
            console.log('input', event.input);
            return event.input;
          }
        `,
      });
    expect(res.status).toBe(201);
    bot = res.body as Bot;

    // Create streaming bot
    const streamingRes = await request(app)
      .post(`/fhir/R4/Bot`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Bot',
        identifier: [{ system: 'https://example.com/bot', value: randomUUID() }],
        name: 'Streaming Test Bot',
        runtimeVersion: 'awslambda',
        code: `
          export async function handler(medplum, event) {
            const { responseStream } = event;
            responseStream.startStreaming(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive'
            });
            responseStream.write('data: Hello \\n\\n');
            responseStream.write('data: World!\\n\\n');
            responseStream.end();
            return 'done';
          }
        `,
      });
    expect(streamingRes.status).toBe(201);
    streamingBot = streamingRes.body as Bot;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  describe('Non-streaming multi-line response parsing', () => {
    test('Streaming-compatible response with 2xx status', async () => {
      const encoder = new TextEncoder();
      const headersLine = JSON.stringify({ statusCode: 200, headers: { 'Content-Type': 'text/plain' } });
      const bodyLine = JSON.stringify('hello from lambda');
      const payload = headersLine + '\n' + bodyLine;

      mockLambdaClient.on(InvokeCommand).callsFake(() => ({
        LogResult: 'U1RBUlQgUmVxdWVzdElkOiAxMjM0NQpFTkQgUmVxdWVzdElkOiAxMjM0NQ==',
        Payload: encoder.encode(payload),
      }));

      const res = await request(app)
        .post(`/fhir/R4/Bot/${bot.id}/$execute`)
        .set('Content-Type', ContentType.TEXT)
        .set('Authorization', 'Bearer ' + accessToken)
        .send('input');
      expect(res.status).toBe(200);
      expect(res.text).toBe('hello from lambda');
    });

    test('Streaming-compatible response with non-2xx status', async () => {
      const encoder = new TextEncoder();
      const headersLine = JSON.stringify({ statusCode: 400, headers: { 'Content-Type': 'application/json' } });
      const bodyLine = JSON.stringify({ error: 'bad request' });
      const payload = headersLine + '\n' + bodyLine;

      mockLambdaClient.on(InvokeCommand).callsFake(() => ({
        LogResult: 'U1RBUlQgUmVxdWVzdElkOiAxMjM0NQpFTkQgUmVxdWVzdElkOiAxMjM0NQ==',
        Payload: encoder.encode(payload),
      }));

      const res = await request(app)
        .post(`/fhir/R4/Bot/${bot.id}/$execute`)
        .set('Content-Type', ContentType.TEXT)
        .set('Authorization', 'Bearer ' + accessToken)
        .send('input');
      expect(res.status).toBe(400);
    });

    test('Multi-line response where first line is valid JSON but not streaming headers', async () => {
      const encoder = new TextEncoder();
      // First line is valid JSON but missing statusCode/headers
      const firstLine = JSON.stringify({ someOtherField: true });
      const secondLine = JSON.stringify('second line');
      const payload = firstLine + '\n' + secondLine;

      mockLambdaClient.on(InvokeCommand).callsFake(() => ({
        LogResult: 'U1RBUlQgUmVxdWVzdElkOiAxMjM0NQpFTkQgUmVxdWVzdElkOiAxMjM0NQ==',
        Payload: encoder.encode(payload),
      }));

      const res = await request(app)
        .post(`/fhir/R4/Bot/${bot.id}/$execute`)
        .set('Content-Type', ContentType.TEXT)
        .set('Authorization', 'Bearer ' + accessToken)
        .send('input');
      // First line doesn't have statusCode/headers, so returnValueLine is never set
      // returnValue will be undefined, success remains true
      expect(res.status).toBe(200);
    });
  });

  describe('Accept: text/event-stream (SSE streaming)', () => {
    test('Streaming execution with chunks', async () => {
      const res = await request(app)
        .post(`/fhir/R4/Bot/${streamingBot.id}/$execute`)
        .set('Content-Type', ContentType.TEXT)
        .set('Accept', 'text/event-stream')
        .set('Authorization', 'Bearer ' + accessToken)
        .send('input');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('text/event-stream');

      const events = res.text.split('\n\n').filter((e) => e.startsWith('data: '));
      expect(events.length).toStrictEqual(2);
      expect(events[0]).toStrictEqual('data: Hello ');
      expect(events[1]).toStrictEqual('data: World!');
    });

    test('Streaming execution with JSON input', async () => {
      const res = await request(app)
        .post(`/fhir/R4/Bot/${streamingBot.id}/$execute`)
        .set('Content-Type', ContentType.JSON)
        .set('Accept', 'text/event-stream')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({ message: 'hello' });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('text/event-stream');

      const events = res.text.split('\n\n').filter((e) => e.startsWith('data: '));
      expect(events.length).toStrictEqual(2);
      expect(events[0]).toStrictEqual('data: Hello ');
      expect(events[1]).toStrictEqual('data: World!');
    });

    test('Streaming execution with malformed headers', async () => {
      // Override the mock to return invalid JSON headers
      mockLambdaClient.on(InvokeWithResponseStreamCommand).callsFake(() => {
        const encoder = new TextEncoder();

        async function* createEventStream(): AsyncGenerator<{
          PayloadChunk?: { Payload: Uint8Array };
          InvokeComplete?: { LogResult?: string };
        }> {
          // Send malformed headers (not valid JSON)
          yield { PayloadChunk: { Payload: encoder.encode('not valid json\n') } };
          yield { InvokeComplete: {} };
        }

        return { EventStream: createEventStream() };
      });

      const res = await request(app)
        .post(`/fhir/R4/Bot/${streamingBot.id}/$execute`)
        .set('Content-Type', ContentType.TEXT)
        .set('Accept', 'text/event-stream')
        .set('Authorization', 'Bearer ' + accessToken)
        .send('input');
      expect(res.status).toBe(400);
      expect(res.body.issue[0].details.text).toContain('Failed to parse streaming headers');
    });

    test('Streaming execution with Lambda error', async () => {
      // Override the mock to return an error
      mockLambdaClient.on(InvokeWithResponseStreamCommand).callsFake(() => {
        async function* createEventStream(): AsyncGenerator<{
          PayloadChunk?: { Payload: Uint8Array };
          InvokeComplete?: { ErrorCode?: string; ErrorDetails?: string };
        }> {
          yield {
            InvokeComplete: {
              ErrorCode: 'Unhandled',
              ErrorDetails: 'Test error message',
            },
          };
        }

        return { EventStream: createEventStream() };
      });

      const res = await request(app)
        .post(`/fhir/R4/Bot/${streamingBot.id}/$execute`)
        .set('Content-Type', ContentType.TEXT)
        .set('Accept', 'text/event-stream')
        .set('Authorization', 'Bearer ' + accessToken)
        .send('input');
      expect(res.status).toBe(400);
      expect(res.body.issue[0].details.text).toContain('Lambda error: Unhandled');
    });

    test('Streaming execution with headers split across chunks', async () => {
      // Override the mock to split headers across multiple chunks
      mockLambdaClient.on(InvokeWithResponseStreamCommand).callsFake(() => {
        const encoder = new TextEncoder();
        const headersJson = JSON.stringify({
          statusCode: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });

        async function* createEventStream(): AsyncGenerator<{
          PayloadChunk?: { Payload: Uint8Array };
          InvokeComplete?: { LogResult?: string };
        }> {
          // Split the headers line across two chunks
          const midpoint = Math.floor(headersJson.length / 2);
          yield { PayloadChunk: { Payload: encoder.encode(headersJson.substring(0, midpoint)) } };
          yield { PayloadChunk: { Payload: encoder.encode(headersJson.substring(midpoint) + '\n') } };
          // Send data
          yield { PayloadChunk: { Payload: encoder.encode('data: Split test\n\n') } };
          yield {
            InvokeComplete: {
              LogResult: `U1RBUlQgUmVxdWVzdElkOiAxMjM0NQpFTkQgUmVxdWVzdElkOiAxMjM0NQ==`,
            },
          };
        }

        return { EventStream: createEventStream() };
      });

      const res = await request(app)
        .post(`/fhir/R4/Bot/${streamingBot.id}/$execute`)
        .set('Content-Type', ContentType.TEXT)
        .set('Accept', 'text/event-stream')
        .set('Authorization', 'Bearer ' + accessToken)
        .send('input');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('text/event-stream');
      expect(res.text).toContain('data: Split test');
    });

    test('Streaming request but bot returns early without streaming', async () => {
      // Override the mock to simulate bot returning JSON without using streaming
      // This happens when bot returns early (e.g., OperationOutcome error)
      mockLambdaClient.on(InvokeWithResponseStreamCommand).callsFake(() => {
        const encoder = new TextEncoder();
        const headersJson = JSON.stringify({
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
        });
        const resultJson = JSON.stringify({
          resourceType: 'OperationOutcome',
          issue: [{ severity: 'error', code: 'invalid', details: { text: 'Test error' } }],
        });

        async function* createEventStream(): AsyncGenerator<{
          PayloadChunk?: { Payload: Uint8Array };
          InvokeComplete?: { LogResult?: string };
        }> {
          // Bot returns JSON without streaming - headers line then result
          yield { PayloadChunk: { Payload: encoder.encode(headersJson + '\n') } };
          yield { PayloadChunk: { Payload: encoder.encode(resultJson) } };
          yield {
            InvokeComplete: {
              LogResult: `U1RBUlQgUmVxdWVzdElkOiAxMjM0NQpFTkQgUmVxdWVzdElkOiAxMjM0NQ==`,
            },
          };
        }

        return { EventStream: createEventStream() };
      });

      const res = await request(app)
        .post(`/fhir/R4/Bot/${streamingBot.id}/$execute`)
        .set('Content-Type', ContentType.TEXT)
        .set('Accept', 'text/event-stream')
        .set('Authorization', 'Bearer ' + accessToken)
        .send('input');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/json');
      expect(res.body.resourceType).toBe('OperationOutcome');
      expect(res.body.issue[0].details.text).toBe('Test error');
    });
  });
});
