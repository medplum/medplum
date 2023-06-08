import express from 'express';
// import request from 'supertest';
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

    // const res = await request(app).get('/');
    // expect(res.status).toBe(200);
    // expect(res.headers['cache-control']).toBeDefined();
    // expect(res.headers['content-security-policy']).toBeDefined();
    // expect(res.headers['referrer-policy']).toBeDefined();

    const response = await request(server)
      .ws('/ws')
      .expectText('hello')
      .sendText('foo')
      .expectText('echo foo')
      .sendText('abc')
      .expectText('echo abc')
      .close()
      .expectClosed();
    expect(response).toBeDefined();

    await shutdownApp();
  }, 5000);
});
