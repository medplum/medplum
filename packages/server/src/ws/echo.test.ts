// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Express } from 'express';
import express from 'express';
import type { Server } from 'node:http';
import request from 'superwstest';
import { vi } from 'vitest';
import type { WebSocket } from 'ws';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import type { MedplumServerConfig } from '../config/types';
import { globalLogger } from '../logger';
import * as redis from '../redis';
import { withTestContext } from '../test.setup';
import { handleEchoConnection } from './echo';

describe('Echo websocket', () => {
  let app: Express;
  let config: MedplumServerConfig;
  let server: Server;

  beforeAll(async () => {
    app = express();
    config = await loadTestConfig();
    server = await initApp(app, config);

    await new Promise<void>((resolve) => {
      server.listen(0, 'localhost', 8522, resolve);
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Echo', () =>
    withTestContext(async () => {
      await request(server)
        .ws('/ws/echo')
        .sendText('foo')
        .expectText('foo')
        .sendText('bar')
        .expectText('bar')
        .close()
        .expectClosed();
    }));

  test('Logs when subscribe rejects', () =>
    withTestContext(async () => {
      const subscribeError = new Error('Connection is closed.');
      const subscriberSpy = vi.spyOn(redis, 'getPubSubRedisSubscriber').mockReturnValue({
        status: 'ready',
        subscribe: vi.fn().mockRejectedValue(subscribeError),
        on: vi.fn(),
        disconnect: vi.fn(),
      } as any);
      const errorSpy = vi.spyOn(globalLogger, 'error').mockImplementation(() => undefined);

      const socket = { on: vi.fn(), send: vi.fn() } as unknown as WebSocket;

      try {
        await expect(handleEchoConnection(socket)).resolves.toBeUndefined();
        expect(errorSpy).toHaveBeenCalledWith('[WS] Failed to subscribe to echo channel', {
          error: subscribeError,
        });
      } finally {
        subscriberSpy.mockRestore();
        errorSpy.mockRestore();
      }
    }));
});
