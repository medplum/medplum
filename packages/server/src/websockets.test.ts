import express, { Express } from 'express';
import { Server } from 'http';
import request from 'superwstest';
import { initApp, shutdownApp } from './app';
import { MedplumServerConfig, loadTestConfig } from './config';

let app: Express;
let config: MedplumServerConfig;
let server: Server;

describe('WebSockets', () => {
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

  test('Connect', async () => {
    await request(server)
      .ws('/ws')
      .sendText('foo')
      .expectText('foo')
      .sendText('abc')
      .expectText('abc')
      .close()
      .expectClosed();
  });

  test('Invalid endpoint', async () => {
    await request(server).ws('/foo').expectConnectionError();
  });
});
