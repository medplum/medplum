import express from 'express';
import { Server } from 'http';
import { AddressInfo } from 'net';
import request from 'superwstest';
import WebSocket from 'ws';
import { initApp, shutdownApp } from './app';
import { MedplumServerConfig, loadTestConfig } from './config';

const app = express();
let config: MedplumServerConfig;
let server: Server;

describe('WebSockets', () => {
  beforeAll(async () => {
    config = await loadTestConfig();
    server = await initApp(app, config);

    await new Promise<void>((resolve) => {
      server.listen(0, 'localhost', 511, resolve);
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Echo', async () => {
    await request(server)
      .ws('/ws/echo')
      .sendText('foo')
      .expectText('foo')
      .sendText('abc')
      .expectText('abc')
      .close()
      .expectClosed();
  });

  test('Invalid endpoint', async () => {
    await request(server).ws('/foo').expectConnectionError();
    const serverUrl = `localhost:${(server.address() as AddressInfo).port}`;

    // Make sure even when we error, we are getting back a response from server to prevent hanging socket connection
    const ws = new WebSocket(`ws://${serverUrl}/fhircast/STU3`);
    await new Promise<void>((done) => {
      ws.on('error', (err) => {
        expect(err.message).toContain('404');
        done();
      });
    });
  });
});
