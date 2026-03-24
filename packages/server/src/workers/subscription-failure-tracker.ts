// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { generateId } from '@medplum/core';
import type { Project } from '@medplum/fhirtypes';
import { getConfig } from '../config/loader';
import type { SubscriptionAutoDisableTrigger } from '../config/types';
import type { SystemRepository } from '../fhir/repo';
import { globalLogger } from '../logger';
import { getCacheRedis } from '../redis';

const subscriptionAutoDisableSystemSettingName = 'subscriptionAutoDisable';

function getRedisKey(subscriptionId: string): string {
  return `medplum:sub:failures:${subscriptionId}`;
}

function getServerConfigTriggers(): SubscriptionAutoDisableTrigger[] | undefined {
  return getConfig().subscriptionAutoDisable;
}

function isValidTrigger(value: unknown): value is SubscriptionAutoDisableTrigger {
  return (
    !!value &&
    typeof value === 'object' &&
    Number.isInteger((value as SubscriptionAutoDisableTrigger).maxConsecutiveFailures) &&
    (value as SubscriptionAutoDisableTrigger).maxConsecutiveFailures > 0 &&
    Number.isInteger((value as SubscriptionAutoDisableTrigger).timeWindowSeconds) &&
    (value as SubscriptionAutoDisableTrigger).timeWindowSeconds > 0
  );
}

function parseProjectOverride(project: Project): SubscriptionAutoDisableTrigger[] | undefined {
  const setting = project.systemSetting?.find((s) => s.name === subscriptionAutoDisableSystemSettingName);
  if (!setting) {
    return undefined;
  }

  if (setting.valueString === undefined) {
    globalLogger.warn('Project subscription auto-disable override is missing valueString', { project: project.id });
    return undefined;
  }

  try {
    const parsed = JSON.parse(setting.valueString) as unknown;
    if (!Array.isArray(parsed) || !parsed.every(isValidTrigger)) {
      throw new Error('Expected an array of subscription auto-disable trigger objects');
    }
    return parsed;
  } catch (err) {
    globalLogger.warn('Project subscription auto-disable override is invalid; falling back to server config', {
      project: project.id,
      error: err,
    });
    return undefined;
  }
}

export async function getSubscriptionAutoDisableTriggers(
  systemRepo: SystemRepository,
  projectId?: string
): Promise<SubscriptionAutoDisableTrigger[] | undefined> {
  if (projectId) {
    try {
      const project = await systemRepo.readResource<Project>('Project', projectId);
      const projectOverride = parseProjectOverride(project);
      if (projectOverride !== undefined) {
        return projectOverride;
      }
    } catch (err) {
      globalLogger.warn('Failed to load project subscription auto-disable override; falling back to server config', {
        project: projectId,
        error: err,
      });
    }
  }

  return getServerConfigTriggers();
}

/**
 * Records a subscription failure and checks all auto-disable triggers.
 * Uses a single Redis sorted set with timestamps as scores.
 * Each trigger is checked independently via ZCOUNT over its time window.
 * @param shardId - The shard ID.
 * @param subscriptionId - The subscription ID.
 * @param triggers - Optional auto-disable triggers to evaluate for this subscription.
 * @returns The trigger that fired, or undefined if none did.
 */
export async function recordSubscriptionFailure(
  shardId: string,
  subscriptionId: string,
  triggers = getServerConfigTriggers()
): Promise<{ trigger: SubscriptionAutoDisableTrigger; failureCount: number } | undefined> {
  if (!triggers || triggers.length === 0) {
    return undefined;
  }

  const redis = getCacheRedis(shardId);
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
 * @param shardId - The shard ID.
 * @param subscriptionId - The subscription ID.
 */
export async function clearSubscriptionFailures(shardId: string, subscriptionId: string): Promise<void> {
  const redis = getCacheRedis(shardId);
  await redis.unlink(getRedisKey(subscriptionId));
}
