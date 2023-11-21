import { AsyncLocalStorage } from 'async_hooks';
import { IncomingMessage } from 'http';
import ws from 'ws';
import { globalLogger } from '../logger';
import { getRedis } from '../redis';
import { setupHeartbeatTimer } from './utils';

const heartbeatTimerCallbacks = new Map<string, () => void>();
const cleanupPromises = [] as Promise<void>[];

/**
 * Cleans up heartbeat timers for FHIRcast WebSocket connections.
 */
export function cleanupHeartbeatTimers(): void {
  for (const cleanup of heartbeatTimerCallbacks.values()) {
    cleanup();
  }
}

/**
 *
 * @returns Promise that resolves when all registered WebSocket cleanup Promises have resolved or rejected.
 */
export async function cleanupWebSockets(): Promise<unknown> {
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

  // Subscribe to the topic
  await redisSubscriber.subscribe(topic);
  if (!heartbeatTimerCallbacks.has(topic)) {
    const [, numOfSubscribers] = (await redis.pubsub('NUMSUB', topic)) as [string, number];
    if (numOfSubscribers === 1) {
      // We check if there is exactly one subscriber, ie. we are the first subscriber
      heartbeatTimerCallbacks.set(topic, setupHeartbeatTimer(topic, 10000));
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
    const promise = redisSubscriber
      .unsubscribe(topic)
      .then(() => {
        (redis.pubsub('NUMSUB', topic) as Promise<[string, number]>)
          .then(([, numOfSubscribers]) => {
            if (numOfSubscribers === 0 && heartbeatTimerCallbacks.has(topic)) {
              const cb = heartbeatTimerCallbacks.get(topic) as () => void;
              cb();
              heartbeatTimerCallbacks.delete(topic);
            }
            redisSubscriber.disconnect();
          })
          .catch(console.error);
      })
      .catch(console.error);

    cleanupPromises.push(promise);
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
