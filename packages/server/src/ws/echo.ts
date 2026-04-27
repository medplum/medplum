// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import type { RawData, WebSocket } from 'ws';
import { DEFAULT_HEARTBEAT_MS, heartbeat } from '../heartbeat';
import { globalLogger } from '../logger';
import { setGauge } from '../otel/otel';
import { publish } from '../pubsub';
import { getPubSubRedisSubscriber } from '../redis';

const hostname = os.hostname();
const METRIC_OPTIONS = { attributes: { hostname } };
const echoWebSockets = new Set<WebSocket>();
let echoHeartbeatHandler: (() => void) | undefined;
let echoMessagesSent = 0;
let echoMessagesReceived = 0;

export function initEchoHeartbeat(): void {
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
export async function handleEchoConnection(socket: WebSocket): Promise<void> {
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
      await publish(channel, data as Buffer);
    })
  );

  socket.on('close', () => {
    echoWebSockets.delete(socket);
    redisSubscriber.disconnect();
  });
}

export function stopEchoHeartbeat(): void {
  if (echoHeartbeatHandler) {
    heartbeat.removeEventListener('heartbeat', echoHeartbeatHandler);
    echoHeartbeatHandler = undefined;
  }
}
