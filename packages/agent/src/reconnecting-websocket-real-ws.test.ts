// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ReconnectingWebSocket, sleep } from '@medplum/core';
import type { AddressInfo } from 'node:net';
import net from 'node:net';
import type * as WsModule from 'ws';

/**
 * Regression tests for `ReconnectingWebSocket` against the real `ws` library (the test setup mocks
 * `ws` with mock-socket, so the real implementation is loaded via `vi.importActual`).
 *
 * When `ws.WebSocket.close()` is called while the socket is still CONNECTING (e.g. when the
 * `connectionTimeout` fires because the remote is blackholing traffic, DNS is hanging, or the
 * server accepted the TCP connection but never completes the WebSocket handshake), `ws` aborts the
 * handshake and emits 'error' on the *next tick*. `ReconnectingWebSocket` used to remove all of its
 * listeners before closing, so that 'error' was emitted on an EventEmitter with no listeners --
 * which throws as an uncaught exception and kills the agent process.
 */
describe('ReconnectingWebSocket with real ws', () => {
  let RealWebSocket: typeof WsModule.WebSocket;

  beforeAll(async () => {
    const realWsModule = await vi.importActual<typeof WsModule>('ws');
    RealWebSocket = realWsModule.WebSocket;
  });

  test('Does not crash when connection times out while socket is still CONNECTING', async () => {
    const uncaughtExceptions: Error[] = [];
    const onUncaughtException = (err: Error): void => {
      uncaughtExceptions.push(err);
    };
    process.on('uncaughtException', onUncaughtException);

    // A TCP server that accepts connections but never completes the WebSocket handshake,
    // keeping the client in CONNECTING until the connectionTimeout fires
    const acceptedSockets = new Set<net.Socket>();
    const server = net.createServer((socket) => {
      // Intentionally do nothing with the connection except track it for cleanup
      acceptedSockets.add(socket);
      socket.on('close', () => acceptedSockets.delete(socket));
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const port = (server.address() as AddressInfo).port;

    const rws = new ReconnectingWebSocket<WsModule.WebSocket>(`ws://127.0.0.1:${port}/ws/agent`, undefined, {
      WebSocket: RealWebSocket,
      binaryType: 'nodebuffer',
      connectionTimeout: 250,
      minReconnectionDelay: 50,
      maxReconnectionDelay: 100,
    });

    const timeoutErrors: string[] = [];
    rws.addEventListener('error', (event) => {
      timeoutErrors.push(event.message);
    });

    // Wait for at least 2 connection timeout cycles, then give the asynchronous (next tick)
    // 'error' emissions from the aborted handshakes a chance to fire
    while (timeoutErrors.length < 2) {
      await sleep(50);
    }
    await sleep(100);

    rws.close();
    await sleep(100);

    process.off('uncaughtException', onUncaughtException);
    for (const socket of acceptedSockets) {
      socket.destroy();
    }
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });

    expect(timeoutErrors.length).toBeGreaterThanOrEqual(2);
    expect(timeoutErrors[0]).toStrictEqual('TIMEOUT');
    expect(uncaughtExceptions).toHaveLength(0);
  });
});
