// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import express from 'express';
import type { Server } from 'node:http';
import request from 'superwstest';
import type { AddressInfo } from 'ws';
import { WebSocketServer } from 'ws';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import type { MedplumServerConfig } from '../config/types';
import { initTestAuth } from '../test.setup';

describe('AI realtime websocket', () => {
  let app: express.Express;
  let config: MedplumServerConfig;
  let server: Server;

  beforeAll(async () => {
    app = express();
    config = await loadTestConfig();
    server = await initApp(app, config);

    await new Promise<void>((resolve) => {
      server.listen(0, 'localhost', 8523, resolve);
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Rejects non-connect first message', async () => {
    await request(server)
      .ws('/ws/ai-realtime')
      .sendText('not json')
      .expectJson((actual) => {
        expect(actual.type).toBe('ai-realtime:error');
        expect(actual.body).toContain('Invalid connect message');
      })
      .close()
      .expectClosed();
  });

  test('Rejects token without realtime claims', async () => {
    await initTestAuth({
      project: {
        features: ['openai-realtime-transcription'] as any,
        secret: [{ name: 'OPENAI_API_KEY', valueString: 'sk-test-key' }],
      },
    });

    await request(server)
      .ws('/ws/ai-realtime')
      .sendText(JSON.stringify({ type: 'ai-realtime:connect', accessToken: 'not-a-real-token' }))
      .expectJson((actual) => {
        expect(actual.type).toBe('ai-realtime:error');
        expect(actual.body).toBe('Invalid access token');
      })
      .close()
      .expectClosed();
  });

  test('Proxies messages after connect', async () => {
    const upstreamServer = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => {
      upstreamServer.once('listening', () => resolve());
    });

    config.aiRealtimeTranscriptionUrl = `ws://127.0.0.1:${(upstreamServer.address() as AddressInfo).port}`;

    upstreamServer.on('connection', (upstreamSocket) => {
      upstreamSocket.on('message', (data, isBinary) => {
        upstreamSocket.send(data, { binary: isBinary });
      });
    });

    const accessToken = await initTestAuth({
      project: {
        features: ['ai-realtime'] as any,
        secret: [{ name: 'OPENAI_API_KEY', valueString: 'sk-test-key' }],
      },
    });

    await request(server)
      .ws('/ws/ai-realtime')
      .sendText(JSON.stringify({ type: 'ai-realtime:connect', accessToken }))
      .expectText('{"type":"ai-realtime:connected"}')
      .sendText('{"type":"session.update","session":{"type":"transcription"}}')
      .expectText('{"type":"session.update","session":{"type":"transcription"}}')
      .close()
      .expectClosed();

    await new Promise<void>((resolve, reject) => {
      upstreamServer.close((err) => (err ? reject(err) : resolve()));
    });
  });
});
