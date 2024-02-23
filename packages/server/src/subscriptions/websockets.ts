import { badRequest, createReference } from '@medplum/core';
import { Bundle, Resource, Subscription } from '@medplum/fhirtypes';
import { Redis } from 'ioredis';
import { JWTPayload } from 'jose';
import crypto from 'node:crypto';
import ws from 'ws';
import { AdditionalWsBindingClaims } from '../fhir/operations/getwsbindingtoken';
import { CacheEntry } from '../fhir/repo';
import { getFullUrl } from '../fhir/response';
import { heartbeat } from '../heartbeat';
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
  const subscriptionIds = [] as string[];
  let redisSubscriber: Redis | undefined;
  let onDisconnect: (() => Promise<void>) | undefined;
  let heartbeatHandler: (() => void) | undefined;

  const onBind = async (tokenPayload: JWTPayload & Partial<AdditionalWsBindingClaims>): Promise<void> => {
    const subscriptionId = tokenPayload?.subscription_id;
    if (!subscriptionId) {
      socket.send(
        JSON.stringify(badRequest('Token claims missing subscription_id. Make sure you are sending the correct token.'))
      );
      socket.terminate();
      return;
    }

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

      onDisconnect = async (): Promise<void> => {
        await redisSubscriber?.quit();
        const cacheEntryStr = (await redis.get(`Subscription/${subscriptionId}`)) as string | null;
        if (!cacheEntryStr) {
          globalLogger.error('[WS] Failed to retrieve subscription cache entry on WebSocket disconnect.');
          return;
        }
        const cacheEntry = JSON.parse(cacheEntryStr) as CacheEntry<Subscription>;
        await markInMemorySubscriptionsInactive(cacheEntry.projectId, subscriptionIds);
      };
    }

    if (!subscriptionIds.includes(subscriptionId)) {
      subscriptionIds.push(subscriptionId);
    }
    await redisSubscriber.subscribe(subscriptionId);

    if (!heartbeatHandler) {
      heartbeatHandler = (): void => {
        socket.send(JSON.stringify(createSubHeartbeatEvent(subscriptionIds)));
      };
      heartbeat.addEventListener('heartbeat', heartbeatHandler);
    }
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

  socket.on('close', () => {
    if (onDisconnect) {
      onDisconnect().catch(console.error);
    }
    if (heartbeatHandler) {
      heartbeat.removeEventListener('heartbeat', heartbeatHandler);
    }
  });
}

export type SubStatus = 'requested' | 'active' | 'error' | 'off';
export type SubEventsOptions = { status?: SubStatus; includeResource?: boolean };

export function createSubHeartbeatEvent(subscriptionIds: string[]): Bundle {
  const timestamp = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    resourceType: 'Bundle',
    type: 'history',
    timestamp,
    entry: subscriptionIds.map((subscriptionId) => ({
      resource: {
        resourceType: 'SubscriptionStatus',
        id: crypto.randomUUID(),
        status: 'active',
        type: 'heartbeat',
        subscription: { reference: `Subscription/${subscriptionId}` },
      },
    })),
  };
}

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
    id: crypto.randomUUID(),
    resourceType: 'Bundle',
    type: 'history',
    timestamp,
    entry: [
      {
        resource: {
          id: crypto.randomUUID(),
          resourceType: 'SubscriptionStatus',
          status,
          type: 'event-notification',
          subscription: { reference: `Subscription/${subscriptionId}` },
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

export async function markInMemorySubscriptionsInactive(projectId: string, subscriptionIds: string[]): Promise<void> {
  const refStrs = [];
  for (const subscriptionId of subscriptionIds) {
    refStrs.push(`Subscription/${subscriptionId}`);
  }
  const redis = getRedis();
  await redis.multi().srem(`medplum:subscriptions:r4:project:${projectId}:active`, refStrs).del(refStrs).exec();
}
