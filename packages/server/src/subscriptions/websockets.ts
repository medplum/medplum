import { badRequest, createReference } from '@medplum/core';
import { Bundle, Resource } from '@medplum/fhirtypes';
import { Redis } from 'ioredis';
import { JWTPayload } from 'jose';
import ws from 'ws';
import { AdditionalWsBindingClaims } from '../fhir/operations/getwsbindingtoken';
import { getFullUrl } from '../fhir/search';
import { globalLogger } from '../logger';
import { verifyJwt } from '../oauth/keys';
import { getRedis } from '../redis';

interface BaseSubscriptionClientMsg {
  type: string;
  payload: Record<string, unknown>;
}

export interface BindWithTokenMsg extends BaseSubscriptionClientMsg {
  type: 'bind-with-token';
  payload: { token: string };
}

export async function handleR4SubscriptionConnection(socket: ws.WebSocket): Promise<void> {
  const redis = getRedis();
  let redisSubscriber: Redis;

  let onDisconnect: (() => void) | undefined;
  const onBind = async (tokenPayload: JWTPayload): Promise<void> => {
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

    if (!tokenPayload.subscription_id) {
      socket.send(
        JSON.stringify(badRequest('Token claims missing subscription_id. Make sure you are sending the correct token.'))
      );
    }

    await redisSubscriber.subscribe((tokenPayload as AdditionalWsBindingClaims)?.subscription_id);
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
        const token = msg?.payload?.token;
        if (!token) {
          globalLogger.error('[WS]: invalid client message - missing token', { data, socket });
          return;
        }
        try {
          const { payload } = await verifyJwt(token);
          await onBind(payload);
        } catch (_err) {
          socket.send(JSON.stringify(badRequest('Token failed to validate. Check token expiry.')));
        }
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

export type SubStatus = 'requested' | 'active' | 'error' | 'off';
export type SubEventsOptions = { status?: SubStatus; includeResource?: boolean };

export function createSubEventNotification<ResourceType extends Resource = Resource>(
  resource: ResourceType,
  subscriptionId: string,
  options?: SubEventsOptions
): Bundle {
  const { status, includeResource } = {
    status: 'active',
    includeResource: false,
    ...(options ?? {}),
  } as { status: SubStatus; includeResource: boolean };
  const timestamp = new Date().toISOString();
  return {
    resourceType: 'Bundle',
    type: 'history',
    timestamp,
    entry: [
      {
        resource: {
          resourceType: 'SubscriptionStatus',
          status,
          type: 'event-notification',
          subscription: createReference({ resourceType: 'Subscription', id: subscriptionId }),
          notificationEvent: [{ eventNumber: '0', timestamp, focus: createReference(resource) }],
        },
      },
      ...(includeResource
        ? [
            {
              resource,
              fullUrl: getFullUrl(resource.resourceType, resource.id as string),
            },
          ]
        : []),
    ],
  };
}
