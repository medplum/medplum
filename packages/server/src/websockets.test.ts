import { sleep } from '@medplum/core';
import express, { Express } from 'express';
import { Server } from 'http';
import { AddressInfo } from 'net';
import request from 'superwstest';
import WebSocket from 'ws';
import { initApp, shutdownApp } from './app';
import { MedplumServerConfig, loadTestConfig } from './config';
import { withTestContext } from './test.setup';

describe('WebSockets', () => {
  let app: Express;
  let config: MedplumServerConfig;
  let server: Server;

  beforeAll(async () => {
    app = express();
    config = await loadTestConfig();
    server = await initApp(app, config);

    await new Promise<void>((resolve) => {
      server.listen(0, 'localhost', 511, resolve);
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

  test('Invalid endpoint', () =>
    withTestContext(async () => {
      await request(server).ws('/foo').expectConnectionError();
      const serverUrl = `localhost:${(server.address() as AddressInfo).port}`;

      // Make sure even when we error, we are getting back a response from server to prevent hanging socket connection
      const ws = new WebSocket(`ws://${serverUrl}/fhircast/STU3`);
      const err = await new Promise<Error>((resolve) => {
        ws.on('error', (err: Error) => {
          resolve(err);
        });
      });
      expect(err.message).toContain('404');
    }));
});
