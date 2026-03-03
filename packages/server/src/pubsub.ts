// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getPubSubRedis } from './redis';

export function publish(channel: string, message: string | Buffer): Promise<number> {
  return getPubSubRedis().publish(channel, message);
}

// --- Active WebSocket subscription hash helpers ---

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

export function isSubscriptionActive(projectId: string, resourceType: string, subRef: string): Promise<number> {
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
