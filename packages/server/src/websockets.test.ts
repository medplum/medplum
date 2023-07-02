import express from 'express';
import request from 'superwstest';
import { initApp, shutdownApp } from './app';
import { loadTestConfig } from './config';

describe('WebSockets', () => {
  test('Connect', async () => {
    const app = express();
    const config = await loadTestConfig();
    const server = await initApp(app, config);

    await new Promise<void>((resolve) => {
      server.listen(0, 'localhost', 511, resolve);
    });

    const response = await request(server)
      .ws('/ws')
      .sendText('foo')
      .expectText('foo')
      .sendText('abc')
      .expectText('abc')
      .close()
      .expectClosed();
    expect(response).toBeDefined();

    await shutdownApp();
  }, 5000);
});
