// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { generateId } from '@medplum/core';
import { AsyncLocalStorage } from 'node:async_hooks';
import { IncomingMessage } from 'node:http';
import os from 'node:os';
import { RawData, WebSocket } from 'ws';
import { DEFAULT_HEARTBEAT_MS, heartbeat } from '../heartbeat';
import { globalLogger } from '../logger';
import { setGauge } from '../otel/otel';
import { getRedis, getRedisSubscriber } from '../redis';

const hostname = os.hostname();
const METRIC_OPTIONS = { attributes: { hostname } };
let heartbeatHandler: (() => void) | undefined;

const websocketMap = new Map<WebSocket, string>();
const topicRefCountMap = new Map<string, number>();

export function initFhircastHeartbeat(): void {
  if (!heartbeatHandler) {
    heartbeatHandler = (): void => {
      const baseHeartbeatPayload = {
        timestamp: new Date().toISOString(),
        id: generateId(),
        event: {
          context: [{ key: 'period', decimal: `${Math.ceil(DEFAULT_HEARTBEAT_MS / 1000)}` }],
          'hub.event': 'heartbeat',
        },
      };

      const redis = getRedis();
      for (const projectAndTopic of topicRefCountMap.keys()) {
        redis
          .publish(
            projectAndTopic as string,
            JSON.stringify({
              ...baseHeartbeatPayload,
              event: { ...baseHeartbeatPayload.event, 'hub.topic': projectAndTopic.split(':')[1] },
            })
          )
          .catch(console.error);
      }

      setGauge('medplum.fhircast.websocketCount', websocketMap.size, METRIC_OPTIONS);
      setGauge('medplum.fhircast.topicCount', topicRefCountMap.size, METRIC_OPTIONS);
    };

    heartbeat.addEventListener('heartbeat', heartbeatHandler);
  }
}

export function stopFhircastHeartbeat(): void {
  if (heartbeatHandler) {
    heartbeat.removeEventListener('heartbeat', heartbeatHandler);
    heartbeatHandler = undefined;
  }
}

/**
 * Handles a new WebSocket connection to the FHIRcast hub.
 * @param socket - The WebSocket connection.
 * @param request - The HTTP request.
 */
export async function handleFhircastConnection(socket: WebSocket, request: IncomingMessage): Promise<void> {
  const topicEndpoint = (request.url as string).split('/').filter(Boolean)[2];
  const endpointTopicKey = `medplum:fhircast:endpoint:${topicEndpoint}:topic`;

  const projectAndTopic = await getRedis().get(endpointTopicKey);
  if (!projectAndTopic) {
    globalLogger.error(`[FHIRcast]: No topic associated with the endpoint '${topicEndpoint}'`);
    // Close the socket since this endpoint is not valid
    socket.send(
      JSON.stringify({
        'hub.mode': 'denied',
        'hub.topic': '',
        'hub.events': '',
        'hub.reason': 'invalid endpoint',
      }),
      { binary: false }
    );
    socket.close();
    return;
  }

  // Create a redis client for this connection.
  // According to Redis documentation: http://redis.io/commands/subscribe
  // Once the client enters the subscribed state it is not supposed to issue any other commands,
  // except for additional SUBSCRIBE, PSUBSCRIBE, UNSUBSCRIBE and PUNSUBSCRIBE commands.
  const redisSubscriber = getRedisSubscriber();

  // Subscribe to the topic
  await redisSubscriber.subscribe(projectAndTopic);

  const topic = projectAndTopic?.split(':')[1] ?? 'invalid topic';
  // Increment ref count for the specified topic
  topicRefCountMap.set(projectAndTopic, (topicRefCountMap.get(projectAndTopic) ?? 0) + 1);
  websocketMap.set(socket, projectAndTopic);

  redisSubscriber.on('message', (_channel: string, message: string) => {
    // Forward the message to the client
    socket.send(message, { binary: false });
  });

  socket.on(
    'message',
    AsyncLocalStorage.bind(async (data: RawData) => {
      const message = JSON.parse((data as Buffer).toString('utf8'));
      globalLogger.debug('message', message);
    })
  );

  socket.on('close', () => {
    const topic = websocketMap.get(socket);
    if (topic) {
      websocketMap.delete(socket);
      const topicRefCount = topicRefCountMap.get(topic);
      if (!topicRefCount) {
        globalLogger.error('[FHIRcast]: No topic ref count for this topic');
      } else if (topicRefCount === 1) {
        topicRefCountMap.delete(topic);
      } else {
        topicRefCountMap.set(topic, topicRefCount - 1);
      }
    }
    redisSubscriber.disconnect();
  });

  // Send initial connection verification
  // TODO: Fill in these properties
  socket.send(
    JSON.stringify({
      'hub.callback': '',
      'hub.channel': '',
      'hub.events': '',
      'hub.lease_seconds': 3600,
      'hub.mode': 'subscribe',
      'hub.secret': '',
      'hub.subscriber': '',
      'hub.topic': topic,
    }),
    { binary: false }
  );
}
