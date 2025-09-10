// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { badRequest, createReference, normalizeErrorString, WithId } from '@medplum/core';
import { Bundle, Resource, Subscription } from '@medplum/fhirtypes';
import { Redis } from 'ioredis';
import { JWTPayload } from 'jose';
import crypto from 'node:crypto';
import os from 'node:os';
import { RawData, WebSocket } from 'ws';
import { getRepoForLogin } from '../fhir/accesspolicy';
import { AdditionalWsBindingClaims } from '../fhir/operations/getwsbindingtoken';
import { CacheEntry } from '../fhir/repo';
import { getFullUrl } from '../fhir/response';
import { rewriteAttachments, RewriteMode } from '../fhir/rewrite';
import { heartbeat } from '../heartbeat';
import { globalLogger } from '../logger';
import { MedplumBaseClaims, verifyJwt } from '../oauth/keys';
import { getLoginForAccessToken } from '../oauth/utils';
import { setGauge } from '../otel/otel';
import { getRedis, getRedisSubscriber } from '../redis';

interface BaseSubscriptionClientMsg {
  type: string;
  payload: Record<string, unknown>;
}

export interface BindWithTokenMsg extends BaseSubscriptionClientMsg {
  type: 'bind-with-token';
  payload: { token: string };
}

export interface UnbindFromTokenMsg extends BaseSubscriptionClientMsg {
  type: 'unbind-from-token';
  payload: { token: string };
}

export type SubscriptionClientMsg = BindWithTokenMsg | UnbindFromTokenMsg | { type: 'ping' };

export interface WebSocketSubMetadata {
  rawToken: string;
}

export type WebSocketSubToken = JWTPayload & MedplumBaseClaims & AdditionalWsBindingClaims;

const hostname = os.hostname();
const METRIC_OPTIONS = { attributes: { hostname } };

const wsToSubLookup = new Map<WebSocket, Map<string, WebSocketSubMetadata>>();
const subToWsLookup = new Map<string, Set<WebSocket>>();

let redisSubscriber: Redis | undefined;
let heartbeatHandler: (() => void) | undefined;

async function setupSubscriptionHandler(): Promise<void> {
  redisSubscriber = getRedisSubscriber();
  redisSubscriber.on('message', async (channel: string, events: string) => {
    globalLogger.debug('[WS] redis subscription events', { channel, events });
    const subEventArgsArr = JSON.parse(events) as [
      WithId<Resource>,
      subscriptionId: string,
      options?: SubEventsOptions,
    ][];
    for (const [resource, subscriptionId, options] of subEventArgsArr) {
      const bundle = createSubEventNotification(resource, subscriptionId, options);
      for (const socket of subToWsLookup.get(subscriptionId) ?? []) {
        // Get the repo for this socket in the context of the subscription
        const subMetadataMap = wsToSubLookup.get(socket);
        if (!subMetadataMap) {
          // We should really never hit this log, this is a true error
          globalLogger.error('[WS] Unable to find sub metadata map for WebSocket');
          continue;
        }
        const subMetadata = subMetadataMap.get(subscriptionId);
        if (!subMetadata) {
          // We should really never hit this log, this is a true error
          globalLogger.error('[WS] Unable to find sub metadata entry for WebSocket', { subscriptionId });
          continue;
        }

        let rewrittenBundle: Bundle;
        try {
          const authState = await getLoginForAccessToken(undefined, subMetadata.rawToken);
          if (!authState) {
            globalLogger.info('[WS] Unable to get login for the given access token', { subscriptionId });
            continue;
          }
          const repo = await getRepoForLogin(authState);
          rewrittenBundle = await rewriteAttachments(RewriteMode.PRESIGNED_URL, repo, bundle);
        } catch (err) {
          globalLogger.error('[WS] Error occurred while rewriting attachments', { err });
          continue;
        }

        socket.send(JSON.stringify(rewrittenBundle), { binary: false });
      }
    }
  });
  await redisSubscriber.subscribe('medplum:subscriptions:r4:websockets');
}

function ensureHeartbeatHandler(): void {
  if (!heartbeatHandler) {
    heartbeatHandler = (): void => {
      for (const [ws, metadata] of wsToSubLookup.entries()) {
        ws.send(JSON.stringify(createSubHeartbeatEvent(metadata)));
      }
      setGauge('medplum.subscription.websocketCount', wsToSubLookup.size, METRIC_OPTIONS);
      setGauge('medplum.subscription.subscriptionCount', subToWsLookup.size, METRIC_OPTIONS);
    };
    heartbeat.addEventListener('heartbeat', heartbeatHandler);
  }
}

function subscribeWsToSubscription(ws: WebSocket, subscriptionId: string, rawToken: string): void {
  let wsSet = subToWsLookup.get(subscriptionId);
  let subEntryMap = wsToSubLookup.get(ws);
  if (!wsSet) {
    wsSet = new Set();
    subToWsLookup.set(subscriptionId, wsSet);
  }
  if (!subEntryMap) {
    subEntryMap = new Map();
    wsToSubLookup.set(ws, subEntryMap);
  }
  wsSet.add(ws);
  subEntryMap.set(subscriptionId, { rawToken });
}

function unsubscribeWsFromSubscription(ws: WebSocket, subscriptionId: string): void {
  // Check for WebSocket in map for this subscription ID
  const wsSet = subToWsLookup.get(subscriptionId);
  if (wsSet) {
    wsSet.delete(ws);
    // Cleanup entry for this subscriptionId if empty
    if (wsSet.size === 0) {
      subToWsLookup.delete(subscriptionId);
    }
  }

  // Check for subscription in map for this WebSocket
  const subIdSet = wsToSubLookup.get(ws);
  if (subIdSet) {
    subIdSet.delete(subscriptionId);
    // Cleanup entry for this WebSocket if empty
    if (subIdSet.size === 0) {
      wsToSubLookup.delete(ws);
    }
  }
}

function unsubscribeWsFromAllSubscriptions(ws: WebSocket): void {
  const subEntries = wsToSubLookup.get(ws);
  if (!subEntries) {
    globalLogger.error('[WS] No entry for given WebSocket in subscription lookup');
    return;
  }
  for (const subscriptionId of subEntries.keys()) {
    if (!subToWsLookup.has(subscriptionId)) {
      globalLogger.error(`[WS] Subscription binding to subscription ${subscriptionId} for this WebSocket is missing`);
      continue;
    }
    const wsSet = subToWsLookup.get(subscriptionId) as Set<WebSocket>;
    wsSet.delete(ws);
    if (wsSet.size === 0) {
      subToWsLookup.delete(subscriptionId);
    }
  }
  wsToSubLookup.delete(ws);
}

// NOTE(ThatOneBro - 06/13/24): Although many parts of the WebSocket Subscription system are set up for multiple subscribers to one subscription
// The current flow will always mark an unbound subscription as inactive (see `markInMemorySubscriptionsInactive`), which will remove it from the list of active
// Subscriptions for the associated project and it will not be evaluated against resource interactions
//
// In order for this to be possible in the future, we should probably move from Redis Sets to Redis Hashes, where
// Each project entry becomes a map of subscriptions to their current ref count (how many subscribers each has)
// This seems like it is potentially error prone without ensured atomicity of Redis operations between server instances but I'm sure there are existing solutions for this

export async function handleR4SubscriptionConnection(socket: WebSocket): Promise<void> {
  const redis = getRedis();
  let onDisconnect: (() => Promise<void>) | undefined;

  const verifyWsToken = async (token: string): Promise<WebSocketSubToken | undefined> => {
    let tokenPayload: JWTPayload;
    try {
      const { payload } = await verifyJwt(token);
      tokenPayload = payload;
    } catch (err) {
      globalLogger.warn(`[WS]: Error occurred while verifying client message token: ${normalizeErrorString(err)}`);
      socket.send(JSON.stringify(badRequest('Token failed to validate. Check token expiry.')));
      return undefined;
    }

    if (!tokenPayload?.subscription_id) {
      socket.send(
        JSON.stringify(badRequest('Token claims missing subscription_id. Make sure you are sending the correct token.'))
      );
      socket.terminate();
      return undefined;
    }
    if (!tokenPayload?.login_id) {
      socket.send(
        JSON.stringify(badRequest('Token claims missing login_id. Make sure you are sending the correct token.'))
      );
      socket.terminate();
      return undefined;
    }
    return tokenPayload as WebSocketSubToken;
  };

  const onBind = async (rawToken: string): Promise<void> => {
    const verifiedToken = await verifyWsToken(rawToken);
    if (!verifiedToken) {
      // If no token, this was not a valid token, don't bind
      return;
    }

    if (!redisSubscriber) {
      await setupSubscriptionHandler();
    }
    subscribeWsToSubscription(socket, verifiedToken.subscription_id, rawToken);
    ensureHeartbeatHandler();
    // Send a handshake to notify client that this subscription is active for this connection
    socket.send(JSON.stringify(createHandshakeBundle(verifiedToken.subscription_id)));

    onDisconnect = async (): Promise<void> => {
      const subEntries = wsToSubLookup.get(socket);
      if (!subEntries) {
        globalLogger.warn('[WS] No entry for given WebSocket in subscription lookup');
        return;
      }
      unsubscribeWsFromAllSubscriptions(socket);
      const cacheEntryStr = (await redis.get(`Subscription/${verifiedToken.subscription_id}`)) as string | null;
      if (!cacheEntryStr) {
        globalLogger.warn('[WS] Failed to retrieve subscription cache entry on WebSocket disconnect');
        return;
      }
      const cacheEntry = JSON.parse(cacheEntryStr) as CacheEntry<Subscription>;
      await markInMemorySubscriptionsInactive(cacheEntry.projectId, new Set(subEntries.keys()));
    };
  };

  const onUnbind = async (rawToken: string): Promise<void> => {
    const verifiedToken = await verifyWsToken(rawToken);
    if (!verifiedToken) {
      // If no token, this was not a valid token, don't attempt unbind
      return;
    }

    unsubscribeWsFromSubscription(socket, verifiedToken.subscription_id);
    const cacheEntryStr = (await redis.get(`Subscription/${verifiedToken.subscription_id}`)) as string | null;
    if (!cacheEntryStr) {
      globalLogger.warn('[WS] Failed to retrieve subscription cache entry when unbinding from token', {
        subscriptionId: verifiedToken.subscription_id,
      });
      return;
    }
    const cacheEntry = JSON.parse(cacheEntryStr) as CacheEntry<Subscription>;
    await markInMemorySubscriptionsInactive(cacheEntry.projectId, new Set([verifiedToken.subscription_id]));
  };

  socket.on('message', async (data: RawData) => {
    const rawDataStr = (data as Buffer).toString();
    globalLogger.debug('[WS] received data', { data: rawDataStr });
    const msg = JSON.parse(rawDataStr) as SubscriptionClientMsg;
    if (msg.type === 'ping') {
      socket.send(JSON.stringify({ type: 'pong' }));
    } else if (['bind-with-token', 'unbind-from-token'].includes(msg.type)) {
      const token = msg?.payload?.token;
      if (!token) {
        globalLogger.error('[WS]: invalid client message - missing token', { data, socket });
        return;
      }

      // It's actually ok to rebind or unbind to the same token...
      // Since it will essentially tell Redis to subscribe or unsubscribe to these channels
      // Which the current client is already subscribed or unsubscribed from
      switch (msg.type) {
        case 'bind-with-token':
          try {
            await onBind(token);
          } catch (err: unknown) {
            globalLogger.error(`[WS]: Error while binding with token: ${normalizeErrorString(err)}`);
          }
          break;
        case 'unbind-from-token':
          try {
            await onUnbind(token);
          } catch (err: unknown) {
            globalLogger.error(`[WS]: Error while unbinding from token: ${normalizeErrorString(err)}`);
          }
          break;
      }
    } else {
      globalLogger.error('[WS]: invalid client message', { data, socket });
    }
  });

  socket.on('close', () => {
    onDisconnect?.().catch(console.error);
  });
}

export type SubStatus = 'requested' | 'active' | 'error' | 'off';
export type SubEventsOptions = { status?: SubStatus; includeResource?: boolean };

export function createSubHeartbeatEvent(subMetadata: Map<string, WebSocketSubMetadata>): Bundle {
  const timestamp = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    resourceType: 'Bundle',
    type: 'history',
    timestamp,
    entry: Array.from(subMetadata.keys()).map((subscriptionId) => ({
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

export function createHandshakeBundle(subscriptionId: string): Bundle {
  const timestamp = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    resourceType: 'Bundle',
    type: 'history',
    timestamp,
    entry: [
      {
        resource: {
          resourceType: 'SubscriptionStatus',
          id: crypto.randomUUID(),
          status: 'active',
          type: 'handshake',
          subscription: { reference: `Subscription/${subscriptionId}` },
        },
      },
    ],
  };
}

export function createSubEventNotification<T extends WithId<Resource>>(
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
              fullUrl: getFullUrl(resource.resourceType, resource.id),
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
  let redis: Redis | undefined;
  try {
    redis = getRedis();
  } catch {
    redis = undefined;
    globalLogger.debug('Attempted to mark subscriptions as inactive when Redis is closed');
  }
  await redis?.multi().srem(`medplum:subscriptions:r4:project:${projectId}:active`, refStrs).del(refStrs).exec();
}
