import { parseJWTPayload } from '@medplum/core';
import { Redis } from 'ioredis';
import ws from 'ws';
import { globalLogger } from '../logger';
import { getRedis } from '../redis';

interface BaseSubscriptionClientMsg {
  type: string;
  payload: Record<string, unknown>;
}

interface BindWithTokenMsg extends BaseSubscriptionClientMsg {
  type: 'bind-with-token';
  payload: { token: string };
}

export async function handleR4SubscriptionConnection(socket: ws.WebSocket): Promise<void> {
  const redis = getRedis();
  let redisSubscriber: Redis;

  let onDisconnect: (() => void) | undefined;
  const onBind = async (loginId: string): Promise<void> => {
    if (!redisSubscriber) {
      // Create a redis client for this connection.
      // According to Redis documentation: http://redis.io/commands/subscribe
      // Once the client enters the subscribed state it is not supposed to issue any other commands,
      // except for additional SUBSCRIBE, PSUBSCRIBE, UNSUBSCRIBE and PUNSUBSCRIBE commands.
      redisSubscriber = redis.duplicate();

      redisSubscriber.on('message', (channel: string, message: string) => {
        globalLogger.debug('[WS] redis message', { channel, message });
        socket.send(message, { binary: false });
      });

      onDisconnect = () => redisSubscriber.disconnect();
    }

    // Get current subscriptions based on ::subscriptions/r4::bindings::${loginId}
    const [, subscriptions] = await redis.sscan(`::subscriptions/r4::bindings::${loginId}`, 0);
    if (!subscriptions.length) {
      globalLogger.info(`No subscriptions found for user with ID ${loginId}`);
      return;
    }
    await redisSubscriber.subscribe(...subscriptions);
  };

  socket.on('message', async (data: ws.RawData) => {
    const rawDataStr = (data as Buffer).toString();
    globalLogger.debug('[WS] received data', { data: rawDataStr });
    const msg = JSON.parse(rawDataStr) as BindWithTokenMsg;
    switch (msg.type) {
      // It's actually ok to rebind to the same token...
      // Since it will essentially tell redis to subscribe to these channels
      // Which the current client is already subscribed to
      case 'bind-with-token': {
        if (!msg?.payload?.token) {
          globalLogger.error('[WS]: invalid client message - missing token', { data, socket });
          return;
        }
        const tokenPayload = parseJWTPayload(msg.payload.token);
        await onBind(tokenPayload.login_id as string);
        break;
      }
      default:
        globalLogger.error('[WS]: invalid client message', { data, socket });
    }
  });

  socket.on('close', async () => {
    if (onDisconnect) {
      onDisconnect();
    }
  });
}
