import { createDeferredPromise, generateId } from '@medplum/core';
import { AsyncLocalStorage } from 'async_hooks';
import { IncomingMessage } from 'http';
import ws from 'ws';
import { globalLogger } from '../logger';
import { getRedis } from '../redis';

export const DEFAULT_HEARTBEAT_MS = 10 * 1000;

export const heartbeatTopics = new Set<string>();
const cleanupPromises = [] as Promise<void>[];
let heartbeatTimer: NodeJS.Timeout | undefined;

/**
 * Cleans up heartbeat timers for `FHIRcast` WebSocket connections.
 */
export function cleanupHeartbeat(): void {
  heartbeatTopics.clear();
  if (heartbeatTimer) {
    clearTimeout(heartbeatTimer);
    heartbeatTimer = undefined;
  }
}

/**
 * Cleans up WebSockets for `FHIRcast`.
 * @returns Promise that resolves when all registered WebSocket cleanup Promises have resolved or rejected.
 */
export async function waitForWebSocketsCleanup(): Promise<unknown> {
  return Promise.allSettled(cleanupPromises);
}

/**
 * Handles a new WebSocket connection to the FHIRCast hub.
 * @param socket - The WebSocket connection.
 * @param request - The HTTP request.
 */
export async function handleFhircastConnection(socket: ws.WebSocket, request: IncomingMessage): Promise<void> {
  // TODO: Map URL slug to topic ID
  const topic = (request.url as string).split('/').filter(Boolean)[2];

  // Create a redis client for this connection.
  // According to Redis documentation: http://redis.io/commands/subscribe
  // Once the client enters the subscribed state it is not supposed to issue any other commands,
  // except for additional SUBSCRIBE, PSUBSCRIBE, UNSUBSCRIBE and PUNSUBSCRIBE commands.
  const redis = getRedis();
  const redisSubscriber = redis.duplicate();
  const deferredCleanupPromise = createDeferredPromise();
  cleanupPromises.push(deferredCleanupPromise.promise);

  // Subscribe to the topic
  await redisSubscriber.subscribe(topic);
  if (!heartbeatTopics.has(topic)) {
    heartbeatTopics.add(topic);
    if (!heartbeatTimer) {
      const callback = (): void => {
        const heartbeatPayload = {
          timestamp: new Date().toISOString(),
          id: generateId(),
          event: {
            context: [{ key: 'period', decimal: `${Math.ceil(DEFAULT_HEARTBEAT_MS / 1000)}` }],
            'hub.topic': topic,
            'hub.event': 'heartbeat',
          },
        };
        for (const topic of heartbeatTopics.values()) {
          getRedis().publish(topic, JSON.stringify(heartbeatPayload)).catch(console.error);
        }
        heartbeatTimer = setTimeout(callback, DEFAULT_HEARTBEAT_MS);
      };
      heartbeatTimer = setTimeout(callback, DEFAULT_HEARTBEAT_MS);
    }
  }

  redisSubscriber.on('message', (_channel: string, message: string) => {
    // Forward the message to the client
    socket.send(message, { binary: false });
  });

  socket.on(
    'message',
    AsyncLocalStorage.bind(async (data: ws.RawData) => {
      const message = JSON.parse((data as Buffer).toString('utf8'));
      globalLogger.debug('message', message);
    })
  );

  socket.on('close', () => {
    const { resolve, reject } = deferredCleanupPromise;
    redisSubscriber
      .unsubscribe(topic)
      .then(() => {
        (redis.pubsub('NUMSUB', topic) as Promise<[string, number]>)
          .then(([, numOfSubscribers]) => {
            if (numOfSubscribers === 0 && heartbeatTopics.has(topic)) {
              heartbeatTopics.delete(topic);
            }
            if (!heartbeatTopics.size && heartbeatTimer) {
              clearTimeout(heartbeatTimer);
              heartbeatTimer = undefined;
            }
            redisSubscriber.disconnect();
            resolve();
          })
          .catch((err) => {
            reject(err);
            console.error(err);
          });
      })
      .catch((err) => {
        reject(err);
        console.error(err);
      });
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
