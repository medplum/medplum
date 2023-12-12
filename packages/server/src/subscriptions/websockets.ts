import { IncomingMessage } from 'http';
import crypto from 'node:crypto';
import ws from 'ws';
import { globalLogger } from '../logger';
import { getRedis } from '../redis';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export async function handleR4SubscriptionConnection(socket: ws.WebSocket, request: IncomingMessage): Promise<void> {
  const redis = getRedis();
  // Create a redis client for this connection.
  // According to Redis documentation: http://redis.io/commands/subscribe
  // Once the client enters the subscribed state it is not supposed to issue any other commands,
  // except for additional SUBSCRIBE, PSUBSCRIBE, UNSUBSCRIBE and PUNSUBSCRIBE commands.
  const redisSubscriber = redis.duplicate();

  // Get current subscriptions based on ::usubscriptions/r4::bindings::${token}
  const token = request.headers.authorization?.replace('Bearer ', '') as string;
  const subscriptionsStr = await redis.get(
    `::subscriptions/r4::bindings::${textDecoder.decode(
      await crypto.subtle.digest('sha-256', textEncoder.encode(token))
    )}`
  );
  if (!subscriptionsStr) {
    globalLogger.info(`No subscriptions found for user using token ${token}`);
    return;
  }
  const subscriptions = subscriptionsStr.split(',');
  await redisSubscriber.subscribe(...subscriptions);

  redisSubscriber.on('message', (channel: string, message: string) => {
    globalLogger.debug('[WS] redis message', { channel, message });
    socket.send(message, { binary: false });
  });

  socket.on('message', async (data: ws.RawData) => {
    globalLogger.debug('[WS] received data', { data: (data as Buffer).toString() });
  });

  socket.on('close', async () => {
    redisSubscriber.disconnect();
  });
}
