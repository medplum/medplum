// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import bytes from 'bytes';
import type http from 'node:http';
import type { IncomingMessage } from 'node:http';
import type { Server, WebSocket } from 'ws';
import { WebSocketServer } from 'ws';
import { getConfig } from '../config/loader';
import { RequestContext } from '../context';
import { globalLogger } from '../logger';
import { requestContextStore } from '../request-context-store';
import { handleAgentConnection, stopAgentHeartbeat } from './agent';
import { handleAiRealtimeConnection, stopAiRealtimeHeartbeat } from './ai-realtime';
import { handleEchoConnection, initEchoHeartbeat, stopEchoHeartbeat } from './echo';
import { handleFhircastConnection, initFhircastHeartbeat, stopFhircastHeartbeat } from './fhircast';
import { cleanupR4SubscriptionResources, handleR4SubscriptionConnection } from './subscriptions';

const handlerMap = new Map<string, (socket: WebSocket, request: IncomingMessage) => Promise<void>>();
handlerMap.set('echo', handleEchoConnection);
handlerMap.set('agent', handleAgentConnection);
handlerMap.set('ai-realtime', handleAiRealtimeConnection);
handlerMap.set('fhircast', handleFhircastConnection);
handlerMap.set('subscriptions-r4', handleR4SubscriptionConnection);

type WebSocketState = {
  readonly sockets: Set<WebSocket>;
  closing: boolean;
  socketsClosedResolve: (() => void) | undefined;
};

export const WS_CLOSE_TIMEOUT_MS = 30_000;

let wsServer: Server | undefined = undefined;
let wsState: WebSocketState | undefined = undefined;

/**
 * Initializes a websocket listener on the given HTTP server.
 * @param server - The HTTP server.
 */
export function initWebSockets(server: http.Server): void {
  // Each init creates one "generation" of state, captured by the closures below.
  // Handlers never read the module-level globals, so a connection that straggles in
  // during or after shutdown can only ever touch its own generation's state.
  const state: WebSocketState = { sockets: new Set(), closing: false, socketsClosedResolve: undefined };
  const ws = new WebSocketServer({
    noServer: true,
    maxPayload: bytes(getConfig().maxJsonSize) as number,
  });
  wsServer = ws;
  wsState = state;

  ws.on('connection', async (socket, request) => {
    // Track every socket, including ones that arrive mid-shutdown, so that
    // closeWebSockets can wait on (and if necessary terminate) all of them.
    state.sockets.add(socket);

    // Add a default error handler to the socket
    // If we don't do this, then errors will be thrown and crash the server
    socket.on('error', (err) => {
      globalLogger.error('WebSocket connection error', { error: err });
    });

    socket.on('close', () => {
      state.sockets.delete(socket);
      if (state.closing && state.sockets.size === 0) {
        state.socketsClosedResolve?.();
      }
    });

    // If this socket connected as shutdown began, close it with code 1001 (Going away, graceful shutdown).
    // If the client never completes the close handshake, either the closeWebSockets timeout
    // or the `ws` built-in 30 second close timer will terminate it.
    if (state.closing) {
      socket.close(1001);
      return;
    }

    // Set binary type to 'nodebuffer' so that data is returned as Buffer objects
    // See: https://github.com/websockets/ws/blob/master/doc/ws.md#websocketbinarytype
    socket.binaryType = 'nodebuffer';

    const path = getWebSocketPath(request.url as string);
    const handler = handlerMap.get(path);
    if (handler) {
      try {
        await requestContextStore.run(RequestContext.empty(), () => handler(socket, request));
      } catch (err) {
        globalLogger.error('WebSocket connection handler error', { error: err, path });
        socket.close(1011); // 1011 = Internal Error
      }
    } else {
      socket.close();
    }
  });

  server.on('upgrade', (request, socket, head) => {
    if (state.closing) {
      socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
      socket.destroy();
      return;
    }
    if (handlerMap.has(getWebSocketPath(request.url as string))) {
      ws.handleUpgrade(request, socket, head, (websocket) => {
        // Always emit on this generation's server, even if shutdown started while the
        // upgrade was in flight -- the connection listener tracks the socket and closes
        // it with 1001 when `state.closing` is set, so it can never leak untracked.
        ws.emit('connection', websocket, request);
      });
    } else {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
    }
  });

  initFhircastHeartbeat();
  initEchoHeartbeat();
}

function getWebSocketPath(path: string): string {
  return path.split('/').filter(Boolean)[1];
}

/**
 * Closes the websocket server and gracefully closes all connected sockets.
 *
 * Sends a close frame (1001 Going Away) to every connected socket, then waits for them
 * to finish the close handshake. Any socket still open after `timeoutMs` is forcibly
 * terminated. Always resolves, and always leaves the module ready for a fresh
 * initWebSockets call.
 * @param timeoutMs - How long to wait for sockets to close gracefully before terminating them.
 */
export async function closeWebSockets(timeoutMs = WS_CLOSE_TIMEOUT_MS): Promise<void> {
  stopFhircastHeartbeat();
  stopEchoHeartbeat();
  stopAgentHeartbeat();
  stopAiRealtimeHeartbeat();

  const server = wsServer;
  const state = wsState;
  wsServer = undefined;
  wsState = undefined;

  // With `noServer: true`, this does not close client sockets; it only marks the server closed
  server?.close();

  if (state && !state.closing) {
    state.closing = true;

    // Begin a graceful close handshake on all connected sockets.
    // Nothing below awaits before the wait promise is in place, so no close event can be missed.
    for (const socket of state.sockets) {
      socket.close(1001);
    }

    if (state.sockets.size > 0) {
      let timeoutHandle: NodeJS.Timeout | undefined;
      await new Promise<void>((resolve) => {
        state.socketsClosedResolve = resolve;
        timeoutHandle = setTimeout(() => {
          globalLogger.warn('WebSocket shutdown timeout, terminating remaining sockets', {
            remaining: state.sockets.size,
          });
          for (const socket of state.sockets) {
            socket.terminate();
          }
          resolve();
        }, timeoutMs);
      });
      clearTimeout(timeoutHandle);
      // Late close events (e.g. from terminated sockets) find this undefined and no-op
      state.socketsClosedResolve = undefined;
    }
  }

  // Module-level handler resources are only released after the socket drain,
  // since per-socket close handlers (e.g. subscription unbinding) still need them
  cleanupR4SubscriptionResources();
}
