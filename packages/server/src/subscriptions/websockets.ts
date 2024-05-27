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
import { getRedis, getRedisSubscriber } from '../redis';

interface BaseSubscriptionClientMsg {
  type: string;
  payload: Record<string, unknown>;
}

export interface BindWithTokenMsg extends BaseSubscriptionClientMsg {
  type: 'bind-with-token';
  payload: { token: string };
}

const wsToSubLookup = new Map<ws.WebSocket, Set<string>>();
const subToWsLookup = new Map<string, Set<ws.WebSocket>>();
let redisSubscriber: Redis | undefined;
let heartbeatHandler: (() => void) | undefined;

async function setupSubscriptionHandler(): Promise<void> {
  redisSubscriber = getRedisSubscriber();
  redisSubscriber.on('message', (channel: string, events: string) => {
    globalLogger.debug('[WS] redis subscription events', { channel, events });
    const subEventArgsArr = JSON.parse(events) as [Resource, subscriptionId: string, options?: SubEventsOptions][];
    for (const [resource, subscriptionId, options] of subEventArgsArr) {
      const bundle = createSubEventNotification(resource, subscriptionId, options);
      for (const socket of subToWsLookup.get(subscriptionId) ?? []) {
        socket.send(JSON.stringify(bundle), { binary: false });
      }
    }
  });
  await redisSubscriber.subscribe('medplum:subscriptions:r4:websockets');
}

function subscribeWsToSubscription(ws: ws.WebSocket, subscriptionId: string): void {
  let wsSet = subToWsLookup.get(subscriptionId);
  let subIdSet = wsToSubLookup.get(ws);
  if (!wsSet) {
    wsSet = new Set();
    subToWsLookup.set(subscriptionId, wsSet);
  }
  if (!subIdSet) {
    subIdSet = new Set();
    wsToSubLookup.set(ws, subIdSet);
  }
  wsSet.add(ws);
  subIdSet.add(subscriptionId);
}

function ensureHeartbeatHandler(): void {
  if (!heartbeatHandler) {
    heartbeatHandler = (): void => {
      for (const [ws, subscriptionIds] of wsToSubLookup.entries()) {
        ws.send(JSON.stringify(createSubHeartbeatEvent(subscriptionIds)));
      }
    };
    heartbeat.addEventListener('heartbeat', heartbeatHandler);
  }
}

function unsubscribeWsFromAllSubscriptions(ws: ws.WebSocket): void {
  const subscriptionIds = wsToSubLookup.get(ws);
  if (!subscriptionIds) {
    globalLogger.error('[WS] No entry for given WebSocket in subscription lookup');
    return;
  }
  for (const subscriptionId of subscriptionIds) {
    if (!subToWsLookup.has(subscriptionId)) {
      globalLogger.error(`[WS] Subscription binding to subscription ${subscriptionId} for this WebSocket is missing`);
      continue;
    }
    const wsSet = subToWsLookup.get(subscriptionId) as Set<ws.WebSocket>;
    wsSet.delete(ws);
    if (wsSet.size === 0) {
      subToWsLookup.delete(subscriptionId);
    }
  }
  wsToSubLookup.delete(ws);
}

export async function handleR4SubscriptionConnection(socket: ws.WebSocket): Promise<void> {
  const redis = getRedis();
  let onDisconnect: (() => Promise<void>) | undefined;

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
      await setupSubscriptionHandler();
    }
    subscribeWsToSubscription(socket, subscriptionId);
    ensureHeartbeatHandler();

    onDisconnect = async (): Promise<void> => {
      const subscriptionIds = wsToSubLookup.get(socket);
      if (!subscriptionIds) {
        globalLogger.error('[WS] No entry for given WebSocket in subscription lookup');
        return;
      }
      unsubscribeWsFromAllSubscriptions(socket);
      const cacheEntryStr = (await redis.get(`Subscription/${subscriptionId}`)) as string | null;
      if (!cacheEntryStr) {
        globalLogger.error('[WS] Failed to retrieve subscription cache entry on WebSocket disconnect.');
        return;
      }
      const cacheEntry = JSON.parse(cacheEntryStr) as CacheEntry<Subscription>;
      await markInMemorySubscriptionsInactive(cacheEntry.projectId, subscriptionIds);
    };
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
    onDisconnect?.().catch(console.error);
  });
}

export type SubStatus = 'requested' | 'active' | 'error' | 'off';
export type SubEventsOptions = { status?: SubStatus; includeResource?: boolean };

export function createSubHeartbeatEvent(subscriptionIds: Set<string>): Bundle {
  const timestamp = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    resourceType: 'Bundle',
    type: 'history',
    timestamp,
    entry: Array.from(subscriptionIds).map((subscriptionId) => ({
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

export function createSubEventNotification<T extends Resource = Resource>(
  resource: T,
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

export async function markInMemorySubscriptionsInactive(
  projectId: string,
  subscriptionIds: Set<string>
): Promise<void> {
  const refStrs = [];
  for (const subscriptionId of subscriptionIds) {
    refStrs.push(`Subscription/${subscriptionId}`);
  }
  const redis = getRedis();
  await redis.multi().srem(`medplum:subscriptions:r4:project:${projectId}:active`, refStrs).del(refStrs).exec();
}
