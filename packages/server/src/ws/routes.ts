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
import { handleAgentConnection } from './agent';
import { handleAiRealtimeConnection } from './ai-realtime';
import { handleEchoConnection, initEchoHeartbeat, stopEchoHeartbeat } from './echo';
import { handleFhircastConnection, initFhircastHeartbeat, stopFhircastHeartbeat } from './fhircast';
import { handleR4SubscriptionConnection } from './subscriptions';

const handlerMap = new Map<string, (socket: WebSocket, request: IncomingMessage) => Promise<void>>();
handlerMap.set('echo', handleEchoConnection);
handlerMap.set('agent', handleAgentConnection);
handlerMap.set('ai-realtime', handleAiRealtimeConnection);
handlerMap.set('fhircast', handleFhircastConnection);
handlerMap.set('subscriptions-r4', handleR4SubscriptionConnection);

type WebSocketState = {
  readonly sockets: Set<WebSocket>;
  readonly socketsClosedPromise: Promise<void>;
  readonly socketsClosedResolve: () => void;
};

let wsServer: Server | undefined = undefined;
let wsState: WebSocketState | undefined = undefined;

/**
 * Initializes a websocket listener on the given HTTP server.
 * @param server - The HTTP server.
 */
export function initWebSockets(server: http.Server): void {
  wsServer = new WebSocketServer({
    noServer: true,
    maxPayload: bytes(getConfig().maxJsonSize) as number,
  });

  wsServer.on('connection', async (socket, request) => {
    // Set binary type to 'nodebuffer' so that data is returned as Buffer objects
    // See: https://github.com/websockets/ws/blob/master/doc/ws.md#websocketbinarytype
    socket.binaryType = 'nodebuffer';

    if (!wsState?.sockets.size) {
      let socketsClosedResolve!: () => void;
      const socketsClosedPromise = new Promise<void>((resolve) => {
        socketsClosedResolve = resolve;
      });
      wsState = { sockets: new Set(), socketsClosedPromise, socketsClosedResolve };
    }
    wsState.sockets.add(socket);

    // Add a default error handler to the socket
    // If we don't do this, then errors will be thrown and crash the server
    socket.on('error', (err) => {
      globalLogger.error('WebSocket connection error', { error: err });
    });

    socket.on('close', () => {
      if (!wsState) {
        return;
      }
      const { sockets, socketsClosedResolve } = wsState;
      if (sockets.size) {
        sockets.delete(socket);
        if (sockets.size === 0) {
          socketsClosedResolve();
        }
      }
    });

    const path = getWebSocketPath(request.url as string);
    const handler = handlerMap.get(path);
    if (handler) {
      await requestContextStore.run(RequestContext.empty(), () => handler(socket, request));
    } else {
      socket.close();
    }
  });

  server.on('upgrade', (request, socket, head) => {
    if (handlerMap.has(getWebSocketPath(request.url as string))) {
      wsServer?.handleUpgrade(request, socket, head, (socket) => {
        wsServer?.emit('connection', socket, request);
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

export async function closeWebSockets(): Promise<void> {
  stopFhircastHeartbeat();
  stopEchoHeartbeat();

  if (wsServer) {
    wsServer.close();
    wsServer = undefined;
  }
  if (wsState) {
    // Wait for all sockets to close
    await wsState.socketsClosedPromise;
  }
}
