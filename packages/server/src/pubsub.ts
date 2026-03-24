// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { isResourceType } from '@medplum/core';
import type { ResourceType, Subscription } from '@medplum/fhirtypes';
import type { CacheEntry } from './fhir/repo';
import { globalLogger } from './logger';
import { getCacheRedis, getPubSubRedis } from './redis';

export function publish(shardId: string, channel: string, message: string | Buffer): Promise<number> {
  return getPubSubRedis(shardId).publish(channel, message);
}

// --- Active WebSocket subscription hash helpers ---

export type ActiveSubscriptionEntry = {
  criteria: string;
  expiration: number;
  author: string;
  loginId: string;
  membershipId: string;
};

export type ActiveSubscriptionMap = { [ref: string]: ActiveSubscriptionEntry };

export function getActiveSubsKey(projectId: string, resourceType: ResourceType | '*'): string {
  return `medplum:subscriptions:r4:project:${projectId}:active:v2:${resourceType}`;
}

export function getSubRefsByResourceType(entries: ActiveSubscriptionMap): Map<ResourceType, string[]> {
  const result = new Map<ResourceType, string[]>();
  for (const [ref, entry] of Object.entries(entries)) {
    const resourceType = entry.criteria.split('?')[0] as ResourceType;
    let refs = result.get(resourceType);
    if (!refs) {
      refs = [];
      result.set(resourceType, refs);
    }
    refs.push(ref);
  }
  return result;
}

export function getSubRefsByAuthorRef(entries: ActiveSubscriptionMap): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const [ref, entry] of Object.entries(entries)) {
    let refs = result.get(entry.author);
    if (!refs) {
      refs = [];
      result.set(entry.author, refs);
    }
    refs.push(ref);
  }
  return result;
}

export function setActiveSubscription(
  shardId: string,
  projectId: string,
  resourceType: ResourceType,
  subRef: string,
  entry: ActiveSubscriptionEntry
): Promise<number> {
  return getPubSubRedis(shardId).hset(getActiveSubsKey(projectId, resourceType), subRef, JSON.stringify(entry));
}

export function readActiveSubEntries(rawValues: string[]): ActiveSubscriptionEntry[] {
  if (!rawValues.length) {
    return [];
  }
  return JSON.parse('[' + rawValues.join(',') + ']') as ActiveSubscriptionEntry[];
}

export async function getActiveSubscriptions(
  shardId: string,
  projectId: string,
  resourceType: ResourceType
): Promise<Record<string, ActiveSubscriptionEntry>> {
  const rawEntries = await getPubSubRedis(shardId).hgetall(getActiveSubsKey(projectId, resourceType));
  const refs = Object.keys(rawEntries);
  const parsedEntries = readActiveSubEntries(Object.values(rawEntries));
  const result: Record<string, ActiveSubscriptionEntry> = {};
  for (let i = 0; i < refs.length; i++) {
    result[refs[i]] = parsedEntries[i];
  }
  return result;
}

export async function getActiveSubscriptionEntries(
  shardId: string,
  projectId: string,
  resourceType: ResourceType,
  refs: string[]
): Promise<(ActiveSubscriptionEntry | null)[]> {
  const raw = await getPubSubRedis(shardId).hmget(getActiveSubsKey(projectId, resourceType), ...refs);
  return raw.map((entry) => (entry ? (JSON.parse(entry) as ActiveSubscriptionEntry) : null));
}

export function removeActiveSubscriptions(
  shardId: string,
  projectId: string,
  resourceType: ResourceType,
  refs: string[]
): Promise<number> {
  return getPubSubRedis(shardId).hdel(getActiveSubsKey(projectId, resourceType), ...refs);
}

export function isSubscriptionActive(
  shardId: string,
  projectId: string,
  resourceType: ResourceType,
  subRef: string
): Promise<number> {
  return getPubSubRedis(shardId).hexists(getActiveSubsKey(projectId, resourceType), subRef);
}

// --- Per-user active WebSocket subscription set helpers ---

function getUserActiveSubsKey(authorRef: string): string {
  return `medplum:subscriptions:r4:user:${authorRef}:active`;
}

export function addUserActiveWebSocketSubscription(
  shardId: string,
  authorRef: string,
  subRef: string
): Promise<number> {
  return getPubSubRedis(shardId).sadd(getUserActiveSubsKey(authorRef), subRef);
}

export function removeUserActiveWebSocketSubscriptions(
  shardId: string,
  authorRef: string,
  refs: string[]
): Promise<number> {
  return getPubSubRedis(shardId).srem(getUserActiveSubsKey(authorRef), ...refs);
}

export function getUserActiveWebSocketSubscriptionCount(shardId: string, authorRef: string): Promise<number> {
  return getPubSubRedis(shardId).scard(getUserActiveSubsKey(authorRef));
}

export function getUserActiveWebSocketSubscriptions(shardId: string, authorRef: string): Promise<string[]> {
  return getPubSubRedis(shardId).smembers(getUserActiveSubsKey(authorRef));
}

export async function cleanupUserSubs(shardId: string, authorRef: string): Promise<void> {
  const refs = await getUserActiveWebSocketSubscriptions(shardId, authorRef);
  if (!refs.length) {
    return;
  }
  const cacheEntries = await getCacheRedis(shardId).mget(...refs);
  const staleRefs: string[] = [];
  const activeCheckItems: { ref: string; projectId: string; resourceType: ResourceType }[] = [];
  for (let i = 0; i < refs.length; i++) {
    const entry = cacheEntries[i];
    if (entry === null) {
      staleRefs.push(refs[i]);
    } else {
      const cacheEntry = JSON.parse(entry) as CacheEntry<Subscription>;
      const projectId = cacheEntry.projectId;
      const criteriaResourceType = cacheEntry.resource.criteria.split('?')[0];
      if (projectId && criteriaResourceType && isResourceType(criteriaResourceType)) {
        activeCheckItems.push({ ref: refs[i], projectId, resourceType: criteriaResourceType });
      }
    }
  }
  if (activeCheckItems.length) {
    const pipeline = getPubSubRedis(shardId).pipeline();
    for (const { projectId, resourceType, ref } of activeCheckItems) {
      pipeline.hexists(getActiveSubsKey(projectId, resourceType), ref);
    }
    const results = await pipeline.exec();
    if (results) {
      for (let i = 0; i < activeCheckItems.length; i++) {
        const [err, active] = results[i];
        if (!err && !active) {
          staleRefs.push(activeCheckItems[i].ref);
        }
      }
    }
  }
  if (staleRefs.length) {
    await removeUserActiveWebSocketSubscriptions(shardId, authorRef, staleRefs);
  }
}

export async function cleanupActiveSubs(
  shardId: string,
  projectId: string,
  entryMap: ActiveSubscriptionMap
): Promise<void> {
  try {
    for (const [resourceType, refs] of getSubRefsByResourceType(entryMap)) {
      await removeActiveSubscriptions(shardId, projectId, resourceType, refs);
    }
    for (const [authorRef, refs] of getSubRefsByAuthorRef(entryMap)) {
      await removeUserActiveWebSocketSubscriptions(shardId, authorRef, refs);
    }
  } catch (err: unknown) {
    globalLogger.error('Error when attempting to remove sub entries', err as Error);
  }
}
