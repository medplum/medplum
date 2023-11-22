import { AsyncLocalStorage } from 'async_hooks';
import { IncomingMessage } from 'http';
import ws from 'ws';
import { globalLogger } from '../logger';
import { getRedis } from '../redis';
import { HeartbeatStore } from './utils';

const cleanupPromises = [] as Promise<void>[];
const heartbeatStore = new HeartbeatStore();

/**
 * Cleans up heartbeat timers for FHIRcast WebSocket connections.
 */
export function cleanupHeartbeatTimers(): void {
  heartbeatStore.stopAll();
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

  if (!heartbeatStore.has(topic)) {
    const [, numOfSubscribers] = (await redis.pubsub('NUMSUB', topic)) as [string, number];
    if (numOfSubscribers === 1) {
      heartbeatStore.start(topic, 10000);
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
            if (numOfSubscribers === 0 && heartbeatStore.has(topic)) {
              heartbeatStore.stop(topic);
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
