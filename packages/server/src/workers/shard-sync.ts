// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { OperationOutcomeError, sleep } from '@medplum/core';
import type { Job, QueueBaseOptions } from 'bullmq';
import { Queue, Worker } from 'bullmq';
import { getConfig } from '../config/loader';
import { tryGetRequestContext, tryRunInRequestContext } from '../context';
import { getGlobalSystemRepo, getShardSystemRepo } from '../fhir/repo';
import { GLOBAL_SHARD_ID } from '../fhir/sharding';
import { isRetryableTransactionError } from '../fhir/sql';
import { globalLogger } from '../logger';
import type { WorkerInitializer, WorkerInitializerOptions } from './utils';
import { addVerboseQueueLogging, getBullmqRedisConnectionOptions, getWorkerBullmqConfig, queueRegistry } from './utils';

export interface ShardSyncJobData {
  readonly shardId: string;
  readonly requestId?: string;
  readonly traceId?: string;
}

const queueName = 'ShardSyncQueue';

export const initShardSyncWorker: WorkerInitializer = (config, options?: WorkerInitializerOptions) => {
  const defaultOptions: QueueBaseOptions = {
    connection: getBullmqRedisConnectionOptions(config),
  };

  const queue = new Queue<ShardSyncJobData>(queueName, {
    ...defaultOptions,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    },
  });

  let worker: Worker<ShardSyncJobData> | undefined;
  if (options?.workerEnabled !== false) {
    const workerBullmq = getWorkerBullmqConfig(config, 'shard-sync');
    worker = new Worker<ShardSyncJobData>(
      queueName,
      (job) => tryRunInRequestContext(job.data.requestId, job.data.traceId, () => execShardSyncJob(job)),
      {
        ...defaultOptions,
        ...workerBullmq,
      }
    );
    addVerboseQueueLogging<ShardSyncJobData>(queue, worker, (job) => ({
      shardId: job.data.shardId,
    }));
  }

  return { queue, worker, name: queueName };
};

interface ShardSyncStats {
  processed: number;
  skipped: number;
  deleted: number;
  deadletter: number;
  errors: number;
}

/**
 * Executes a shard sync job.
 * Drains the shard_sync_outbox table on the specified shard and replicates
 * resources to the global shard.
 * @param job - The shard sync job details.
 */
export async function execShardSyncJob(job: Job<ShardSyncJobData>): Promise<void> {
  const shardId = job.data.shardId;

  if (shardId === GLOBAL_SHARD_ID) {
    globalLogger.info('Shard sync not allowed against the global shard');
    return;
  }
  globalLogger.info('Executing shard sync job', { jobData: job.data });

  const config = getConfig().shardSync;
  const batchSize = config?.batchSize ?? 100;
  const maxIterations = config?.maxIterations ?? 1000;
  const delayMs = config?.delayBetweenBatchesMs ?? 10;
  const errorThreshold = config?.globalErrorThreshold ?? 3;
  const maxAttempts = config?.maxAttempts ?? 10;

  const stats: ShardSyncStats = { processed: 0, skipped: 0, deleted: 0, deadletter: 0, errors: 0 };

  for (let i = 0; i < maxIterations; i++) {
    const count = await processOneBatch(shardId, batchSize, errorThreshold, maxAttempts, stats);
    if (count === 0) {
      break;
    }
    if (i < maxIterations - 1) {
      await sleep(delayMs);
    }
  }

  globalLogger.info('Shard sync complete', { shardId, stats });
}

interface OutboxRow {
  id: string; // bigint comes as string from pg
  resourceType: string;
  resourceId: string;
}

interface DeduplicatedEntry {
  resourceType: string;
  resourceId: string;
  outboxIds: string[];
}

/**
 * Processes one batch of outbox rows from the shard.
 * Claims rows with FOR UPDATE SKIP LOCKED, reads resource content from the shard,
 * writes to global, and cleans up outbox rows.
 * @param shardId - The shard to process.
 * @param batchSize - Number of rows to claim per batch.
 * @param errorThreshold - Consecutive global errors before aborting.
 * @param maxAttempts - Max failed attempts before excluding a row.
 * @param stats - Mutable stats accumulator.
 * @returns The number of outbox rows claimed (0 = outbox is empty or fully locked).
 */
async function processOneBatch(
  shardId: string,
  batchSize: number,
  errorThreshold: number,
  maxAttempts: number,
  stats: ShardSyncStats
): Promise<number> {
  const shardRepo = getShardSystemRepo(shardId);

  return shardRepo.withTransaction(async (shardClient) => {
    // Claim batch with row-level locking (simple scan; poison rows moved to deadletter on failure)
    const { rows } = await shardClient.query<OutboxRow>(
      `SELECT "id", "resourceType", "resourceId"
       FROM "shard_sync_outbox"
       ORDER BY "id" ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [batchSize]
    );

    if (rows.length === 0) {
      return 0;
    }

    // Deduplicate and group by resource type in one pass
    const byType = new Map<string, Map<string, DeduplicatedEntry>>();
    for (const row of rows) {
      let typeMap = byType.get(row.resourceType);
      if (!typeMap) {
        typeMap = new Map();
        byType.set(row.resourceType, typeMap);
      }
      const existing = typeMap.get(row.resourceId);
      if (existing) {
        existing.outboxIds.push(row.id);
      } else {
        typeMap.set(row.resourceId, {
          resourceType: row.resourceType,
          resourceId: row.resourceId,
          outboxIds: [row.id],
        });
      }
    }

    const successfulOutboxIds: string[] = [];
    const failedOutboxIds: string[] = [];
    let consecutiveErrors = 0;

    const globalRepo = getGlobalSystemRepo();

    for (const [resourceType, entriesMap] of byType) {
      const entries = Array.from(entriesMap.values());
      const ids = entries.map((e) => e.resourceId);
      const { rows: shardRows } = await shardClient.query<{ id: string; content: string; deleted: boolean }>(
        `SELECT "id", "content", "deleted" FROM "${resourceType}" WHERE "id" = ANY($1)`,
        [ids]
      );

      const contentMap = new Map<string, { content: string; deleted: boolean }>();
      for (const row of shardRows) {
        contentMap.set(row.id, row);
      }

      for (const entry of entries) {
        const shardRow = contentMap.get(entry.resourceId);

        if (!shardRow) {
          // Resource deleted or missing — delete outbox rows, nothing to sync
          successfulOutboxIds.push(...entry.outboxIds);
          stats.skipped++;
          continue;
        }

        if (shardRow.deleted) {
          // Deleted on shard — delete outbox rows
          // SHARDING: propagate deletion to global
          successfulOutboxIds.push(...entry.outboxIds);
          stats.deleted++;
          continue;
        }

        const resource = JSON.parse(shardRow.content);

        // Write to global with per-resource error handling
        try {
          await globalRepo.syncResourceFromShard(resource);
          successfulOutboxIds.push(...entry.outboxIds);
          stats.processed++;
          consecutiveErrors = 0;
        } catch (err) {
          failedOutboxIds.push(...entry.outboxIds);
          if (err instanceof OperationOutcomeError && isRetryableTransactionError(err)) {
            globalLogger.info('Serialization conflict during shard sync, will retry', {
              resource: `${entry.resourceType}/${entry.resourceId}`,
            });
            stats.skipped++;
            consecutiveErrors = 0;
          } else {
            globalLogger.error('Failed to sync resource to global', {
              resource: `${entry.resourceType}/${entry.resourceId}`,
              error: err,
            });
            stats.errors++;
            consecutiveErrors++;
            if (consecutiveErrors >= errorThreshold) {
              // Global shard likely down — abort, let BullMQ retry (withTransaction will rollback)
              throw new Error('Global shard unavailable: too many consecutive errors');
            }
          }
        }
      }
    }

    // Delete successful rows (and their attempt records)
    if (successfulOutboxIds.length > 0) {
      await shardClient.query('DELETE FROM "shard_sync_outbox_attempts" WHERE "outbox_id" = ANY($1)', [
        successfulOutboxIds,
      ]);
      await shardClient.query('DELETE FROM "shard_sync_outbox" WHERE "id" = ANY($1)', [successfulOutboxIds]);
    }

    // Record attempts for failed rows; move poison rows (exceeded maxAttempts) to deadletter
    if (failedOutboxIds.length > 0) {
      await shardClient.query(
        `INSERT INTO "shard_sync_outbox_attempts" ("outbox_id", "attemptedAt")
         SELECT unnest($1::bigint[]), NOW()`,
        [failedOutboxIds]
      );

      // Move rows that have exceeded maxAttempts to deadletter (INSERT...SELECT in one query)
      const { rows: movedRows } = await shardClient.query<{ outbox_id: string }>(
        `INSERT INTO "shard_sync_outbox_deadletter" ("outbox_id", "resourceType", "resourceId", "resourceVersionId", "movedAt")
         SELECT o."id", o."resourceType", o."resourceId", o."resourceVersionId", NOW()
         FROM "shard_sync_outbox" o
         WHERE o."id" IN (
           SELECT a."outbox_id" FROM "shard_sync_outbox_attempts" a
           WHERE a."outbox_id" = ANY($1)
           GROUP BY a."outbox_id"
           HAVING COUNT(*) >= $2
         )
         RETURNING "outbox_id"`,
        [failedOutboxIds, maxAttempts]
      );
      const poisonedOutboxIds = movedRows.map((r) => r.outbox_id);
      if (poisonedOutboxIds.length > 0) {
        stats.deadletter += poisonedOutboxIds.length;
        await shardClient.query('DELETE FROM "shard_sync_outbox" WHERE "id" = ANY($1)', [poisonedOutboxIds]);
      }
    }

    return rows.length;
  });
}

/**
 * Returns the shard sync queue instance.
 * This is used by the unit tests.
 * @returns The shard sync queue (if available).
 */
export function getShardSyncQueue(): Queue<ShardSyncJobData> | undefined {
  return queueRegistry.get(queueName);
}

async function addShardSyncJobData(jobData: ShardSyncJobData): Promise<Job<ShardSyncJobData>> {
  const queue = getShardSyncQueue();
  if (!queue) {
    throw new Error(`Job queue ${queueName} not available`);
  }
  return queue.add('ShardSyncJobData', jobData, {
    deduplication: { id: jobData.shardId },
  });
}

export interface ShardSyncJobOptions {}

export async function addShardSyncJob(shardId: string, options?: ShardSyncJobOptions): Promise<Job<ShardSyncJobData>> {
  const jobData = prepareShardSyncJobData(shardId, options);
  return addShardSyncJobData(jobData);
}

export function prepareShardSyncJobData(shardId: string, _options?: ShardSyncJobOptions): ShardSyncJobData {
  const ctx = tryGetRequestContext();

  return {
    shardId,
    requestId: ctx?.requestId,
    traceId: ctx?.traceId,
  };
}
