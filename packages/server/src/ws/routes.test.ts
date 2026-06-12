// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Express } from 'express';
import express from 'express';
import { randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import request from 'superwstest';
import WebSocket from 'ws';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import type { MedplumServerConfig } from '../config/types';
import { withTestContext } from '../test.setup';
import { closeWebSockets } from './routes';

describe('WebSockets', () => {
  let app: Express;
  let config: MedplumServerConfig;
  let server: Server;

  beforeAll(async () => {
    app = express();
    config = await loadTestConfig();
    server = await initApp(app, config);

    await new Promise<void>((resolve) => {
      server.listen(0, 'localhost', 8511, resolve);
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

describe('WebSocket shutdown', () => {
  async function initTestApp(): Promise<{ server: Server; port: number }> {
    const app = express();
    const config = await loadTestConfig();
    const server = await initApp(app, config);
    await new Promise<void>((resolve) => {
      server.listen(0, 'localhost', resolve);
    });
    return { server, port: (server.address() as AddressInfo).port };
  }

  function connectWebSocket(port: number, path: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}${path}`);
      ws.on('open', () => resolve(ws));
      ws.on('error', reject);
    });
  }

  // Performs a raw HTTP upgrade handshake and then goes silent.
  // Unlike a real WebSocket client, the returned socket never answers close frames,
  // simulating an unresponsive client during graceful shutdown.
  function rawUpgrade(port: number, path: string): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
      const socket = net.connect(port, 'localhost', () => {
        socket.write(
          `GET ${path} HTTP/1.1\r\n` +
            `Host: localhost:${port}\r\n` +
            'Connection: Upgrade\r\n' +
            'Upgrade: websocket\r\n' +
            `Sec-WebSocket-Key: ${randomBytes(16).toString('base64')}\r\n` +
            'Sec-WebSocket-Version: 13\r\n\r\n'
        );
      });
      socket.once('data', (data) => {
        const statusLine = data.toString('utf8').split('\r\n')[0];
        if (statusLine === 'HTTP/1.1 101 Switching Protocols') {
          resolve(socket);
        } else {
          socket.destroy();
          reject(new Error(statusLine));
        }
      });
      socket.on('error', reject);
    });
  }

  test('Connected sockets are closed with 1001 Going Away on shutdown', async () => {
    const { port } = await initTestApp();
    const ws = await connectWebSocket(port, '/ws/echo');
    const closePromise = new Promise<number>((resolve) => {
      ws.on('close', (code) => resolve(code));
    });
    await shutdownApp();
    expect(await closePromise).toBe(1001);
  });

  test('Shutdown resolves promptly when all sockets already closed', async () => {
    const { port } = await initTestApp();
    const ws = await connectWebSocket(port, '/ws/echo');
    await new Promise<void>((resolve) => {
      ws.on('close', () => resolve());
      ws.close();
    });
    const start = Date.now();
    // With sockets having connected and closed before shutdown, this must not
    // wait out the close timeout
    await shutdownApp();
    expect(Date.now() - start).toBeLessThan(20_000);
  });

  test('Unresponsive sockets are terminated after the timeout; upgrades are rejected while closing', async () => {
    const { port } = await initTestApp();
    const rawSocket = await rawUpgrade(port, '/ws/echo');
    const rawClosedPromise = new Promise<void>((resolve) => {
      rawSocket.on('close', () => resolve());
    });

    // Start closing, but do not await yet -- the unresponsive socket holds it open
    const closePromise = closeWebSockets(1500);

    // While closing, new upgrade attempts must be rejected with 503
    await expect(rawUpgrade(port, '/ws/echo')).rejects.toThrow('503');

    // The unresponsive socket must be terminated when the timeout elapses
    await closePromise;
    await rawClosedPromise;

    await shutdownApp();
  });

  test('A new app can serve WebSockets after a timed-out shutdown', async () => {
    // Leave a stuck socket behind so the previous shutdown takes the terminate path
    const first = await initTestApp();
    await rawUpgrade(first.port, '/ws/echo');
    await closeWebSockets(500);
    await shutdownApp();

    // A fresh init must start from clean state -- connections must not be
    // rejected due to any leftover closing state
    const second = await initTestApp();
    const ws = await connectWebSocket(second.port, '/ws/echo');
    const reply = new Promise<string>((resolve) => {
      ws.on('message', (data) => resolve((data as Buffer).toString('utf8')));
    });
    ws.send('hello');
    expect(await reply).toBe('hello');
    ws.close();
    await shutdownApp();
  });
});
