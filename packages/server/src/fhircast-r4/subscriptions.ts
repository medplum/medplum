// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { generateId } from '@medplum/core';
import { getCacheRedis } from '../redis';
import { getLogger } from '../logger';
import type { SubscriberRecord } from './types';
import { DEFAULT_CONFIG, RedisKeys, subscriberWantsEvent } from './types';

/**
 * Manages FHIRcast R4 subscriptions in Redis.
 *
 * Subscriptions are stored in a Redis hash per topic:
 *   Key: medplum:fhircast-r4:project:{projectId}:topic:{topic}:subs
 *   Field: endpoint ID
 *   Value: JSON-serialized SubscriberRecord
 *
 * A reverse mapping from endpoint to projectId:topic is maintained for WebSocket lookups:
 *   Key: medplum:fhircast-r4:endpoint:{endpoint}:topic
 *   Value: "projectId:topic"
 */

/**
 * Generate or retrieve the WebSocket endpoint for a topic.
 * Uses Redis MULTI for atomicity (setnx + get).
 */
export async function getOrCreateEndpoint(projectId: string, topic: string): Promise<string> {
  const endpointKey = RedisKeys.topicEndpoint(projectId, topic);
  const redis = getCacheRedis();

  const results = await redis.multi().setnx(endpointKey, generateId()).get(endpointKey).exec();

  if (!results || results.length !== 2) {
    throw new Error('Redis returned unexpected results for endpoint generation');
  }

  const [err, endpoint] = results[1];
  if (err) {
    throw err;
  }

  const endpointStr = endpoint as string;

  // Maintain reverse mapping: endpoint -> projectId:topic
  const mappingKey = RedisKeys.endpointMapping(endpointStr);
  await redis.setnx(mappingKey, `${projectId}:${topic}`);

  return endpointStr;
}

/**
 * Register a new subscriber for a topic.
 */
export async function addSubscriber(
  projectId: string,
  topic: string,
  endpoint: string,
  events: string,
  subscriberName?: string,
  leaseSeconds?: number
): Promise<SubscriberRecord> {
  const record: SubscriberRecord = {
    endpoint,
    topic,
    projectId,
    events,
    subscriberName,
    leaseSeconds: leaseSeconds ?? DEFAULT_CONFIG.defaultLeaseSeconds,
    subscribedAt: Date.now(),
  };

  const subsKey = RedisKeys.topicSubscribers(projectId, topic);
  await getCacheRedis().hset(subsKey, endpoint, JSON.stringify(record));

  getLogger().info('[FHIRcast R4] Subscriber added', {
    projectId,
    topic,
    endpoint,
    events,
    subscriberName,
  });

  return record;
}

/**
 * Remove a subscriber from a topic.
 */
export async function removeSubscriber(projectId: string, topic: string, endpoint: string): Promise<void> {
  const subsKey = RedisKeys.topicSubscribers(projectId, topic);
  await getCacheRedis().hdel(subsKey, endpoint);

  // Clean up reverse mapping
  const mappingKey = RedisKeys.endpointMapping(endpoint);
  await getCacheRedis().del(mappingKey);

  getLogger().info('[FHIRcast R4] Subscriber removed', { projectId, topic, endpoint });
}

/**
 * Get all subscribers for a topic.
 */
export async function getSubscribers(projectId: string, topic: string): Promise<SubscriberRecord[]> {
  const subsKey = RedisKeys.topicSubscribers(projectId, topic);
  const all = await getCacheRedis().hgetall(subsKey);

  const subscribers: SubscriberRecord[] = [];
  for (const [, value] of Object.entries(all)) {
    try {
      subscribers.push(JSON.parse(value));
    } catch {
      getLogger().error('[FHIRcast R4] Failed to parse subscriber record', { value });
    }
  }
  return subscribers;
}

/**
 * Get a specific subscriber by endpoint.
 */
export async function getSubscriber(
  projectId: string,
  topic: string,
  endpoint: string
): Promise<SubscriberRecord | undefined> {
  const subsKey = RedisKeys.topicSubscribers(projectId, topic);
  const value = await getCacheRedis().hget(subsKey, endpoint);
  if (!value) {
    return undefined;
  }
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/**
 * Get subscribers for a topic that are subscribed to a specific event.
 * Per spec: event filtering is case-insensitive.
 */
export async function getSubscribersForEvent(
  projectId: string,
  topic: string,
  eventName: string
): Promise<SubscriberRecord[]> {
  const all = await getSubscribers(projectId, topic);
  return all.filter((sub) => subscriberWantsEvent(sub.events, eventName));
}

/**
 * Update a subscriber's event list (re-subscription).
 * Per spec: "Each subsequent and verified request SHALL override previous subscription state"
 */
export async function updateSubscriberEvents(
  projectId: string,
  topic: string,
  endpoint: string,
  events: string,
  leaseSeconds?: number
): Promise<SubscriberRecord | undefined> {
  const existing = await getSubscriber(projectId, topic, endpoint);
  if (!existing) {
    return undefined;
  }

  const updated: SubscriberRecord = {
    ...existing,
    events,
    leaseSeconds: leaseSeconds ?? existing.leaseSeconds,
    subscribedAt: Date.now(),
  };

  const subsKey = RedisKeys.topicSubscribers(projectId, topic);
  await getCacheRedis().hset(subsKey, endpoint, JSON.stringify(updated));

  return updated;
}

/**
 * Resolve an endpoint ID to its projectId and topic.
 */
export async function resolveEndpoint(endpoint: string): Promise<{ projectId: string; topic: string } | undefined> {
  const mappingKey = RedisKeys.endpointMapping(endpoint);
  const value = await getCacheRedis().get(mappingKey);
  if (!value) {
    return undefined;
  }

  const colonIndex = value.indexOf(':');
  if (colonIndex === -1) {
    return undefined;
  }

  return {
    projectId: value.substring(0, colonIndex),
    topic: value.substring(colonIndex + 1),
  };
}

/**
 * Check if a topic has any active subscribers.
 */
export async function hasSubscribers(projectId: string, topic: string): Promise<boolean> {
  const subsKey = RedisKeys.topicSubscribers(projectId, topic);
  const count = await getCacheRedis().hlen(subsKey);
  return count > 0;
}

/**
 * Clean up all subscriptions for a topic.
 */
export async function cleanupTopicSubscriptions(projectId: string, topic: string): Promise<void> {
  const subscribers = await getSubscribers(projectId, topic);

  // Clean up reverse mappings
  const pipeline = getCacheRedis().pipeline();
  for (const sub of subscribers) {
    pipeline.del(RedisKeys.endpointMapping(sub.endpoint));
  }
  pipeline.del(RedisKeys.topicSubscribers(projectId, topic));
  await pipeline.exec();

  getLogger().info('[FHIRcast R4] Cleaned up topic subscriptions', {
    projectId,
    topic,
    subscriberCount: subscribers.length,
  });
}
