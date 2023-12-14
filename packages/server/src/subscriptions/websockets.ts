import ws from 'ws';
import { getAuthenticatedContext } from '../context';
import { globalLogger } from '../logger';
import { getRedis } from '../redis';

export async function handleR4SubscriptionConnection(socket: ws.WebSocket): Promise<void> {
  const {
    login: { id: loginId },
  } = getAuthenticatedContext();
  const redis = getRedis();
  // Create a redis client for this connection.
  // According to Redis documentation: http://redis.io/commands/subscribe
  // Once the client enters the subscribed state it is not supposed to issue any other commands,
  // except for additional SUBSCRIBE, PSUBSCRIBE, UNSUBSCRIBE and PUNSUBSCRIBE commands.
  const redisSubscriber = redis.duplicate();

  // Get current subscriptions based on ::subscriptions/r4::bindings::${loginId}
  const [, subscriptions] = await redis.sscan(`::subscriptions/r4::bindings::${loginId}`, 0);
  if (!subscriptions.length) {
    globalLogger.info(`No subscriptions found for user with ID ${loginId}`);
    return;
  }
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
