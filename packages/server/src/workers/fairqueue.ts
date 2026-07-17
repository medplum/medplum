// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ILogger } from '@medplum/core';
import { getConfig } from '../config/loader';
import type { AuthState } from '../oauth/middleware';
import { getRateLimitRedis } from '../redis';

/**
 * Priority-based fair queueing for background jobs.
 *
 * A project's in-flight jobs are counted in Redis so that a project with a large backlog is
 * assigned a LOWER BullMQ priority (a higher priority number) than a project with fewer in-flight
 * jobs. This prevents one project from starving other projects on a shared queue. See
 * https://docs.bullmq.io/guide/jobs/prioritized — priorities range 1..2,097,151 where a LOWER
 * number is a HIGHER priority; 0 means "no priority".
 *
 * The counter is incremented when a job is enqueued and decremented when the job reaches a terminal
 * state. Because it is only used to derive an approximate, best-effort priority, exact accuracy is
 * not required: every increment and decrement (re)sets a TTL, so a leaked increment (e.g. a process
 * crash between enqueue and completion) or a stray negative from a decrement self-expires rather
 * than drifting indefinitely.
 */

/** Maximum BullMQ priority value (lower number = higher priority). */
export const BULLMQ_MAX_PRIORITY = 2_097_151;

/**
 * TTL applied to a project's in-flight counter, refreshed on every increment and decrement. A
 * generous leak backstop: a stuck counter (leaked increment) or a stray negative simply expires.
 */
const FAIR_QUEUE_COUNTER_TTL_SECONDS = 24 * 60 * 60; // 24 hours

/** Project setting name for the per-project override of {@link ServerConfig.enableAsyncBatchFairQueue}. */
const FAIR_QUEUE_SYSTEM_SETTING = 'enableAsyncBatchFairQueue';

function getFairQueueKey(queueName: string, projectId: string): string {
  return `medplum:fairqueue:${queueName}:${projectId}`;
}

/**
 * Determines whether fair queueing is active for the given auth state. A per-project
 * `enableAsyncBatchFairQueue` Project setting wins if present; otherwise the server config flag
 * applies, defaulting to enabled.
 * @param authState - The auth state the job was submitted under.
 * @returns True if fair queueing should be applied.
 */
export function isFairQueueEnabled(authState: Readonly<AuthState>): boolean {
  const override = authState.project.systemSetting?.find((s) => s.name === FAIR_QUEUE_SYSTEM_SETTING);
  if (override?.valueBoolean !== undefined) {
    return override.valueBoolean;
  }
  return !!getConfig().enableAsyncBatchFairQueue;
}

/**
 * Increments the project's in-flight job counter and returns the BullMQ priority to assign the new
 * job (lower number = higher priority), clamped to the valid range. Refreshes the counter's TTL. The
 * slot is released via {@link decrementProjectJobCount} when the job reaches a terminal state.
 * @param logger - The logger instance for logging purposes.
 * @param queueName - The BullMQ queue name.
 * @param projectId - The project id the job belongs to.
 * @returns The BullMQ priority (1..{@link BULLMQ_MAX_PRIORITY}) for the just-enqueued job.
 */
export async function incrementProjectJobPriority(
  logger: ILogger,
  queueName: string,
  projectId: string
): Promise<number> {
  const redis = getRateLimitRedis();
  const key = getFairQueueKey(queueName, projectId);
  const pipeline = redis.pipeline().incr(key).expire(key, FAIR_QUEUE_COUNTER_TTL_SECONDS);
  const results = await pipeline.exec();
  if (!results || results[0]?.[0]) {
    logger.error('Failed to increment fairqueue project job count', { queueName, projectId, error: results?.[0]?.[0] });
  }
  // results[0] is [err, incrResult] for the INCR command.
  const count = (results?.[0]?.[1] as number | undefined) ?? 1;
  // Clamp to BullMQ's valid range; INCR starts at 1, so the lower bound is defensive.
  return Math.min(Math.max(count, 1), BULLMQ_MAX_PRIORITY);
}

/**
 * Decrements the project's in-flight job counter, refreshing its TTL in the same round trip. The
 * TTL refresh is what bounds the key: `DECR` on a missing key (e.g. the counter's TTL lapsed while a
 * long-running job was still in flight) would otherwise recreate it with NO expiry and a negative
 * value that lingers forever; the pipelined `EXPIRE` ensures any zero/negative key self-expires
 * instead. Cleanup is therefore deferred to the TTL rather than deleting the key immediately, which
 * is fine given the key cardinality is bounded by project count.
 * @param logger - The logger instance for logging purposes.
 * @param queueName - The BullMQ queue name.
 * @param projectId - The project id the job belongs to.
 */
export async function decrementProjectJobCount(logger: ILogger, queueName: string, projectId: string): Promise<void> {
  const redis = getRateLimitRedis();
  const key = getFairQueueKey(queueName, projectId);
  const pipeline = redis.pipeline().decr(key).expire(key, FAIR_QUEUE_COUNTER_TTL_SECONDS);
  const results = await pipeline.exec();
  if (!results) {
    logger.error('Failed to decrement fairqueue project job count', { queueName, projectId });
  } else if (results[0]?.[0]) {
    logger.error('Failed to decrement fairqueue project job count', { queueName, projectId, error: results[0][0] });
  }
}
