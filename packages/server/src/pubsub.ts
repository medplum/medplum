// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getPubSubRedis } from './redis';

export function publish(channel: string, message: string | Buffer): Promise<number> {
  return getPubSubRedis().publish(channel, message);
}

// --- Active WebSocket subscription hash helpers ---

export interface ActiveSubMeta {
  subRef: string;
  projectId: string;
  resourceType: string;
}

function getActiveSubsKey(projectId: string, resourceType: string): string {
  return `medplum:subscriptions:r4:project:${projectId}:active:${resourceType}`;
}

export function setActiveSubscription(
  projectId: string,
  resourceType: string,
  subRef: string,
  criteria: string
): Promise<number> {
  return getPubSubRedis().hset(getActiveSubsKey(projectId, resourceType), subRef, criteria);
}

export function getActiveSubscriptions(projectId: string, resourceType: string): Promise<Record<string, string>> {
  return getPubSubRedis().hgetall(getActiveSubsKey(projectId, resourceType));
}

export function removeActiveSubscriptions(projectId: string, resourceType: string, refs: string[]): Promise<number> {
  return getPubSubRedis().hdel(getActiveSubsKey(projectId, resourceType), ...refs);
}

/** Pipeline hdel for each meta entry, removing each subRef from its project active hash. */
export async function batchRemoveActiveSubscription(metas: ActiveSubMeta[]): Promise<void> {
  const pipeline = getPubSubRedis().pipeline();
  for (const { projectId, resourceType, subRef } of metas) {
    pipeline.hdel(getActiveSubsKey(projectId, resourceType), subRef);
  }
  await pipeline.exec();
}

export function isSubscriptionActive(projectId: string, resourceType: string, subRef: string): Promise<number> {
  return getPubSubRedis().hexists(getActiveSubsKey(projectId, resourceType), subRef);
}

/** Pipeline hexists for each meta entry. Returns a map of subRef → whether it exists in its project active hash. */
export async function batchIsSubscriptionActive(metas: ActiveSubMeta[]): Promise<Map<string, boolean>> {
  const pipeline = getPubSubRedis().pipeline();
  for (const { projectId, resourceType, subRef } of metas) {
    pipeline.hexists(getActiveSubsKey(projectId, resourceType), subRef);
  }
  const results = await pipeline.exec();
  const activeMap = new Map<string, boolean>();
  for (let i = 0; i < metas.length; i++) {
    const result = results?.[i];
    activeMap.set(metas[i].subRef, !result?.[0] && result?.[1] === 1);
  }
  return activeMap;
}

// --- Per-user active WebSocket subscription set helpers ---

export function getUserActiveSubsKey(authorRef: string): string {
  return `medplum:subscriptions:r4:user:${authorRef}:active`;
}

export function addUserActiveWebSocketSubscription(authorRef: string, subRef: string): Promise<number> {
  return getPubSubRedis().sadd(getUserActiveSubsKey(authorRef), subRef);
}

export function getUserActiveWebSocketSubscriptions(authorRef: string): Promise<string[]> {
  return getPubSubRedis().smembers(getUserActiveSubsKey(authorRef));
}

export function removeUserActiveWebSocketSubscriptions(authorRef: string, refs: string[]): Promise<number> {
  return getPubSubRedis().srem(getUserActiveSubsKey(authorRef), ...refs);
}

export function clearUserActiveWebSocketSubscriptions(authorRef: string): Promise<number> {
  return getPubSubRedis().unlink(getUserActiveSubsKey(authorRef));
}

export function getUserActiveWebSocketSubscriptionCount(authorRef: string): Promise<number> {
  return getPubSubRedis().scard(getUserActiveSubsKey(authorRef));
}
