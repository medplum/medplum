// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ResourceType } from '@medplum/fhirtypes';
import { globalLogger } from './logger';
import { getPubSubRedis } from './redis';

export function publish(channel: string, message: string | Buffer): Promise<number> {
  return getPubSubRedis().publish(channel, message);
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
  projectId: string,
  resourceType: ResourceType,
  subRef: string,
  entry: ActiveSubscriptionEntry
): Promise<number> {
  return getPubSubRedis().hset(getActiveSubsKey(projectId, resourceType), subRef, JSON.stringify(entry));
}

export function readActiveSubEntries(rawValues: string[]): ActiveSubscriptionEntry[] {
  if (!rawValues.length) {
    return [];
  }
  return JSON.parse('[' + rawValues.join(',') + ']') as ActiveSubscriptionEntry[];
}

export async function getActiveSubscriptions(
  projectId: string,
  resourceType: ResourceType
): Promise<Record<string, ActiveSubscriptionEntry>> {
  const rawEntries = await getPubSubRedis().hgetall(getActiveSubsKey(projectId, resourceType));
  const refs = Object.keys(rawEntries);
  const parsedEntries = readActiveSubEntries(Object.values(rawEntries));
  const result: Record<string, ActiveSubscriptionEntry> = {};
  for (let i = 0; i < refs.length; i++) {
    result[refs[i]] = parsedEntries[i];
  }
  return result;
}

export async function getActiveSubscriptionEntries(
  projectId: string,
  resourceType: ResourceType,
  refs: string[]
): Promise<(ActiveSubscriptionEntry | null)[]> {
  const raw = await getPubSubRedis().hmget(getActiveSubsKey(projectId, resourceType), ...refs);
  return raw.map((entry) => (entry ? (JSON.parse(entry) as ActiveSubscriptionEntry) : null));
}

export function removeActiveSubscriptions(
  projectId: string,
  resourceType: ResourceType,
  refs: string[]
): Promise<number> {
  return getPubSubRedis().hdel(getActiveSubsKey(projectId, resourceType), ...refs);
}

export function isSubscriptionActive(projectId: string, resourceType: ResourceType, subRef: string): Promise<number> {
  return getPubSubRedis().hexists(getActiveSubsKey(projectId, resourceType), subRef);
}

// --- Per-user active WebSocket subscription set helpers ---

function getUserActiveSubsKey(authorRef: string): string {
  return `medplum:subscriptions:r4:user:${authorRef}:active`;
}

export function addUserActiveWebSocketSubscription(authorRef: string, subRef: string): Promise<number> {
  return getPubSubRedis().sadd(getUserActiveSubsKey(authorRef), subRef);
}

export function removeUserActiveWebSocketSubscriptions(authorRef: string, refs: string[]): Promise<number> {
  return getPubSubRedis().srem(getUserActiveSubsKey(authorRef), ...refs);
}

export function getUserActiveWebSocketSubscriptionCount(authorRef: string): Promise<number> {
  return getPubSubRedis().scard(getUserActiveSubsKey(authorRef));
}

export async function cleanupActiveSubs(projectId: string, entryMap: ActiveSubscriptionMap): Promise<void> {
  for (const [resourceType, refs] of getSubRefsByResourceType(entryMap)) {
    await removeActiveSubscriptions(projectId, resourceType, refs);
  }
  try {
    for (const [authorRef, refs] of getSubRefsByAuthorRef(entryMap)) {
      await removeUserActiveWebSocketSubscriptions(authorRef, refs);
    }
  } catch (_err: unknown) {
    globalLogger.error('Attempted to remove active sub entries but Redis was already closed');
  }
}
