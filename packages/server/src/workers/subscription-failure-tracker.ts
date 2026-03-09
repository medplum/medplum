// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { generateId } from '@medplum/core';
import { getConfig } from '../config/loader';
import type { SubscriptionAutoDisableTrigger } from '../config/types';
import { getCacheRedis } from '../redis';

const DEFAULT_TRIGGERS: SubscriptionAutoDisableTrigger[] = [
  { maxConsecutiveFailures: 10, timeWindowSeconds: 600 },
];

function getRedisKey(subscriptionId: string): string {
  return `medplum:sub:failures:${subscriptionId}`;
}

function getTriggers(): SubscriptionAutoDisableTrigger[] {
  const config = getConfig();
  return config.subscriptionAutoDisable ?? DEFAULT_TRIGGERS;
}

/**
 * Records a subscription failure and checks all auto-disable triggers.
 * Uses a single Redis sorted set with timestamps as scores.
 * Each trigger is checked independently via ZCOUNT over its time window.
 * @param subscriptionId - The subscription ID.
 * @returns The trigger that fired, or undefined if none did.
 */
export async function recordSubscriptionFailure(
  subscriptionId: string
): Promise<{ trigger: SubscriptionAutoDisableTrigger; failureCount: number } | undefined> {
  const triggers = getTriggers();
  if (triggers.length === 0) {
    return undefined;
  }

  const redis = getCacheRedis();
  const key = getRedisKey(subscriptionId);
  const now = Date.now();

  // Use the largest window for pruning and TTL
  const maxWindowSeconds = Math.max(...triggers.map((t) => t.timeWindowSeconds));
  const pruneThreshold = now - maxWindowSeconds * 1000;

  // Single pipeline: prune old entries, add new entry, then ZCOUNT for each trigger's window
  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, '-inf', pruneThreshold);
  pipeline.zadd(key, now, `${now}:${generateId()}`);
  for (const trigger of triggers) {
    const windowStart = now - trigger.timeWindowSeconds * 1000;
    pipeline.zcount(key, windowStart, '+inf');
  }
  pipeline.expire(key, maxWindowSeconds);
  const results = await pipeline.exec();

  // ZCOUNT results start at index 2 (after zremrangebyscore and zadd)
  for (let i = 0; i < triggers.length; i++) {
    const zcountResult = results?.[2 + i];
    if (!zcountResult || zcountResult[0]) {
      continue;
    }
    const count = zcountResult[1] as number;
    if (count >= triggers[i].maxConsecutiveFailures) {
      return { trigger: triggers[i], failureCount: count };
    }
  }

  return undefined;
}

/**
 * Clears the failure tracking for a subscription (called on success or after auto-disable).
 * @param subscriptionId - The subscription ID.
 */
export async function clearSubscriptionFailures(subscriptionId: string): Promise<void> {
  const redis = getCacheRedis();
  await redis.del(getRedisKey(subscriptionId));
}
