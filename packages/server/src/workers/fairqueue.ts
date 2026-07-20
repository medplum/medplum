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

/** Project setting name for the per-project override of {@link ServerConfig.asyncBatchFairQueueEnabled}. */
const FAIR_QUEUE_SYSTEM_SETTING = 'asyncBatchFairQueueEnabled';

function getFairQueueKey(queueName: string, projectId: string): string {
  return `medplum:fairqueue:${queueName}:${projectId}`;
}

/**
 * Determines whether fair queueing is active for the given auth state. A per-project
 * `asyncBatchFairQueueEnabled` Project.systemSetting overrides {@link ServerConfig.asyncBatchFairQueueEnabled}
 * @param authState - The auth state the job was submitted under.
 * @returns True if fair queueing should be applied.
 */
export function isFairQueueEnabled(authState: Readonly<AuthState>): boolean {
  const override = authState.project.systemSetting?.find((s) => s.name === FAIR_QUEUE_SYSTEM_SETTING);
  if (override?.valueBoolean !== undefined) {
    return override.valueBoolean;
  }
  return !!getConfig().asyncBatchFairQueueEnabled;
}

/**
 * Increments the project's in-flight job counter and returns the BullMQ priority to assign the new
 * job (lower number = higher priority), clamped to the valid range. Refreshes the counter's TTL. The
 * slot is released via {@link decrementProjectJobPriority} when the job reaches a terminal state.
 * @param logger - The logger instance for logging purposes.
 * @param queueName - The BullMQ queue name.
 * @param projectId - The project id the job belongs to.
 * @returns The BullMQ priority (0..{@link BULLMQ_MAX_PRIORITY}) for the just-enqueued job.
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

  // results[0] is [err, incrResult] for the INCR command.
  if (!results || results[0]?.[0]) {
    logger.error('Error incrementing fairqueue priority', { queueName, projectId, error: results?.[0]?.[0] });
  }
  // Errors in Redis do not block job processing. Incase of error, default to priority of zero;
  // effectively emulating behavior when fair queueing is not enabled. This assumes that Redis
  // errors affect all projects equally
  const priority = (results?.[0]?.[1] as number | undefined) ?? 0;
  return Math.min(Math.max(priority, 0), BULLMQ_MAX_PRIORITY); // Clamp to BullMQ's valid range
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
export async function decrementProjectJobPriority(
  logger: ILogger,
  queueName: string,
  projectId: string
): Promise<void> {
  const redis = getRateLimitRedis();
  const key = getFairQueueKey(queueName, projectId);
  const pipeline = redis.pipeline().decr(key).expire(key, FAIR_QUEUE_COUNTER_TTL_SECONDS);
  const results = await pipeline.exec();
  if (!results) {
    logger.error('Error decrementing fairqueue priority', { queueName, projectId });
  } else if (results[0]?.[0]) {
    logger.error('Error decrementing fairqueue priority', { queueName, projectId, error: results[0][0] });
  }
}
