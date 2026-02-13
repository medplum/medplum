// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import bytes from 'bytes';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type http from 'node:http';
import type { IncomingMessage } from 'node:http';
import os from 'node:os';
import type { RawData, Server, WebSocket } from 'ws';
import { WebSocketServer } from 'ws';
import { handleAgentConnection } from './agent/websockets';
import { getConfig } from './config/loader';
import { RequestContext } from './context';
import { handleFhircastConnection, initFhircastHeartbeat, stopFhircastHeartbeat } from './fhircast/websocket';
import { DEFAULT_HEARTBEAT_MS, heartbeat } from './heartbeat';
import { globalLogger } from './logger';
import { setGauge } from './otel/otel';
import { getPubSubRedis, getPubSubRedisSubscriber } from './redis';
import { requestContextStore } from './request-context-store';
import { handleR4SubscriptionConnection } from './subscriptions/websockets';

const handlerMap = new Map<string, (socket: WebSocket, request: IncomingMessage) => Promise<void>>();
handlerMap.set('echo', handleEchoConnection);
handlerMap.set('agent', handleAgentConnection);
handlerMap.set('fhircast', handleFhircastConnection);
handlerMap.set('subscriptions-r4', handleR4SubscriptionConnection);

type WebSocketState = {
  readonly sockets: Set<WebSocket>;
  readonly socketsClosedPromise: Promise<void>;
  readonly socketsClosedResolve: () => void;
};

let wsServer: Server | undefined = undefined;
let wsState: WebSocketState | undefined = undefined;

const hostname = os.hostname();
const METRIC_OPTIONS = { attributes: { hostname } };
const echoWebSockets = new Set<WebSocket>();
let echoHeartbeatHandler: (() => void) | undefined;
let echoMessagesSent = 0;
let echoMessagesReceived = 0;

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

function initEchoHeartbeat(): void {
  if (!echoHeartbeatHandler) {
    echoHeartbeatHandler = (): void => {
      const heartbeatSeconds = DEFAULT_HEARTBEAT_MS / 1000;
      setGauge('medplum.echo.websocketCount', echoWebSockets.size, METRIC_OPTIONS);
      setGauge('medplum.echo.messagesSentPerSec', echoMessagesSent / heartbeatSeconds, METRIC_OPTIONS);
      setGauge('medplum.echo.messagesReceivedPerSec', echoMessagesReceived / heartbeatSeconds, METRIC_OPTIONS);
      echoMessagesSent = 0;
      echoMessagesReceived = 0;
    };
    heartbeat.addEventListener('heartbeat', echoHeartbeatHandler);
  }
}

/**
 * Handles a new WebSocket connection to the echo service.
 * The echo service simply echoes back whatever it receives.
 * @param socket - The WebSocket connection.
 */
async function handleEchoConnection(socket: WebSocket): Promise<void> {
  echoWebSockets.add(socket);

  // Create a redis client for this connection.
  // According to Redis documentation: http://redis.io/commands/subscribe
  // Once the client enters the subscribed state it is not supposed to issue any other commands,
  // except for additional SUBSCRIBE, PSUBSCRIBE, UNSUBSCRIBE and PUNSUBSCRIBE commands.
  const redisSubscriber = getPubSubRedisSubscriber();
  const channel = randomUUID();

  await redisSubscriber.subscribe(channel);

  redisSubscriber.on('message', (channel: string, message: string) => {
    globalLogger.debug('[WS] redis message', { channel, message });
    socket.send(message, { binary: false });
    echoMessagesSent++;
  });

  socket.on(
    'message',
    AsyncLocalStorage.bind(async (data: RawData) => {
      echoMessagesReceived++;
      await getPubSubRedis().publish(channel, data as Buffer);
    })
  );

  socket.on('close', () => {
    echoWebSockets.delete(socket);
    redisSubscriber.disconnect();
  });
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

function stopEchoHeartbeat(): void {
  if (echoHeartbeatHandler) {
    heartbeat.removeEventListener('heartbeat', echoHeartbeatHandler);
    echoHeartbeatHandler = undefined;
  }
}
