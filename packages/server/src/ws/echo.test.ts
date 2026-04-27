// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { sleep } from '@medplum/core';
import type { Express } from 'express';
import express from 'express';
import type { Server } from 'node:http';
import request from 'superwstest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import type { MedplumServerConfig } from '../config/types';
import { withTestContext } from '../test.setup';

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
        .exec(async () => {
          await sleep(10);
        })
        .sendText('foo')
        .expectText('foo')
        .sendText('bar')
        .expectText('bar')
        .close()
        .expectClosed();
    }));
});
