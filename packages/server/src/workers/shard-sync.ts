// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { OperationOutcomeError, sleep } from '@medplum/core';
import type { ResourceType } from '@medplum/fhirtypes';
import type { Job, JobsOptions, QueueBaseOptions } from 'bullmq';
import { Queue, Worker } from 'bullmq';
import { getConfig } from '../config/loader';
import { tryGetRequestContext, tryRunInRequestContext } from '../context';
import type { SystemRepository } from '../fhir/repo';
import { getGlobalSystemRepo, getShardSystemRepo } from '../fhir/repo';
import { GLOBAL_SHARD_ID } from '../fhir/sharding';
import { isRetryableTransactionError, SqlBuilder } from '../fhir/sql';
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
  expunged: number;
  deadletter: number;
  errors: number;
}

/**
 * Executes a shard sync job.
 * Drains the shard_sync_outbox table on the specified shard and replicates
 * resources to the global shard.
 * @param job - The shard sync job details.
 * @returns The stats of the shard sync job.
 */
export async function execShardSyncJob(job: Job<ShardSyncJobData>): Promise<ShardSyncStats> {
  const shardId = job.data.shardId;
  const stats: ShardSyncStats = { processed: 0, skipped: 0, deleted: 0, expunged: 0, deadletter: 0, errors: 0 };

  if (shardId === GLOBAL_SHARD_ID) {
    globalLogger.info('Shard sync not allowed against the global shard');
    return stats;
  }
  const sourceRepo = getShardSystemRepo(shardId);
  const destinationRepo = getGlobalSystemRepo();
  globalLogger.info('Executing shard sync job', { jobData: job.data });

  const config = getConfig().shardSync;
  const batchSize = config?.batchSize ?? 100;
  const maxIterations = config?.maxIterations ?? 1000;
  const delayMs = config?.delayBetweenBatchesMs ?? 10;
  const errorThreshold = config?.globalErrorThreshold ?? 3;
  const maxAttempts = config?.maxAttempts ?? 10;

  for (let i = 0; i < maxIterations; i++) {
    const count = await processBatch(sourceRepo, destinationRepo, batchSize, errorThreshold, maxAttempts, stats);
    if (count === 0) {
      break;
    }
    if (i < maxIterations - 1) {
      await sleep(delayMs);
    }
  }

  globalLogger.info('Shard sync complete', { shardId, stats });
  return stats;
}

interface OutboxRow {
  id: string; // bigint comes as string from pg
  resourceType: ResourceType;
  resourceId: string;
  resourceVersionId: string;
}

interface ShardResourceRow {
  id: string;
  content: string;
  deleted: boolean;
  projectId: string;
  lastUpdated: Date;
  // history columns
  historyVersionId: string | null;
  historyContent: string | null;
}

interface DeduplicatedEntry {
  resourceType: ResourceType;
  resourceId: string;
  outboxIds: string[];
}

/**
 * Processes a batch of outbox rows from the shard.
 * Claims rows with FOR UPDATE SKIP LOCKED, reads resource content from the shard,
 * writes to global, and cleans up outbox rows.
 * @param sourceRepo - The source repository to read from.
 * @param destinationRepo - The destination repository to write to.
 * @param batchSize - Number of rows to claim per batch.
 * @param errorThreshold - Consecutive global errors before aborting.
 * @param maxAttempts - Max failed attempts before excluding a row.
 * @param stats - Mutable stats accumulator.
 * @returns The number of outbox rows claimed (0 = outbox is empty or fully locked).
 */
async function processBatch(
  sourceRepo: SystemRepository,
  destinationRepo: SystemRepository,
  batchSize: number,
  errorThreshold: number,
  maxAttempts: number,
  stats: ShardSyncStats
): Promise<number> {
  return sourceRepo.withTransaction(async (sourceClient) => {
    // Claim batch with row-level locking
    const builder = new SqlBuilder(
      'SELECT "id", "resourceType", "resourceId", "resourceVersionId" FROM "shard_sync_outbox" ORDER BY "id" ASC LIMIT $1 FOR UPDATE SKIP LOCKED',
      [batchSize]
    );
    const { rows: outboxRows } = await builder.execute<OutboxRow>(sourceClient);
    if (outboxRows.length === 0) {
      return 0;
    }

    const entriesByType = new Map<string, Map<string, DeduplicatedEntry>>();
    for (const row of outboxRows) {
      // group by resource type
      let entriesById = entriesByType.get(row.resourceType);
      if (!entriesById) {
        entriesById = new Map();
        entriesByType.set(row.resourceType, entriesById);
      }

      // group by resource ID
      const entries = entriesById.get(row.resourceId);
      if (entries) {
        entries.outboxIds.push(row.id);
      } else {
        entriesById.set(row.resourceId, {
          resourceType: row.resourceType,
          resourceId: row.resourceId,
          outboxIds: [row.id],
        });
      }
    }

    const successOutboxIds: string[] = [];
    const failedOutboxIds: string[] = [];
    let consecutiveErrors = 0;

    for (const [resourceType, entriesMap] of entriesByType) {
      const entries = Array.from(entriesMap.values());
      const ids = entries.map((e) => e.resourceId);
      const builder = new SqlBuilder(
        `SELECT DISTINCT ON (r.id)
          r."id", r."content", r."deleted", r."projectId", r."lastUpdated",
          h."versionId" as "historyVersionId", h."content" as "historyContent"
          FROM "${resourceType}" as r JOIN "${resourceType}_History" as h ON r.id = h.id
          WHERE r.id = ANY($1) ORDER BY r.id, h."lastUpdated" DESC`,
        [ids]
      );
      const shardResourcesResult = await builder.execute<ShardResourceRow>(sourceClient);
      const shardResourcesById = new Map<string, ShardResourceRow>();
      for (const row of shardResourcesResult.rows) {
        shardResourcesById.set(row.id, row);
      }

      for (const entry of entries) {
        const shardResource = shardResourcesById.get(entry.resourceId);

        // The resource was in the outbox table, but not in the resource table
        // delete outbox rows, expunge the resource from the global shard
        if (!shardResource) {
          await destinationRepo.syncExpungeFromShard(entry.resourceType, entry.resourceId);
          successOutboxIds.push(...entry.outboxIds);
          stats.expunged++;
          continue;
        }

        if (shardResource.content !== shardResource.historyContent) {
          globalLogger.error('[SHARD SYNC] Content mismatch between resource and history', {
            resource: `${entry.resourceType}/${entry.resourceId}`,
            content: shardResource.content,
            historyContent: shardResource.historyContent,
          });
          failedOutboxIds.push(...entry.outboxIds);
          stats.errors++;
          consecutiveErrors++;
          continue;
        }

        if (shardResource.deleted) {
          if (!shardResource.historyVersionId) {
            globalLogger.error('[SHARD SYNC] versionId not found for deleted resource', {
              resource: `${entry.resourceType}/${entry.resourceId}`,
            });
            failedOutboxIds.push(...entry.outboxIds);
            stats.errors++;
            consecutiveErrors++;
            continue;
          }

          // Deleted on shard — propagate deletion to global
          try {
            await destinationRepo.syncDeleteFromShard(
              entry.resourceType,
              entry.resourceId,
              shardResource.lastUpdated,
              shardResource.projectId,
              shardResource.historyVersionId
            );
            successOutboxIds.push(...entry.outboxIds);
            stats.deleted++;
            consecutiveErrors = 0;
          } catch (error) {
            failedOutboxIds.push(...entry.outboxIds);
            if (error instanceof OperationOutcomeError && isRetryableTransactionError(error)) {
              globalLogger.info('[SHARD SYNC] Retryable error during shard sync delete', {
                resource: `${entry.resourceType}/${entry.resourceId}`,
                error,
              });
              stats.skipped++;
              consecutiveErrors = 0;
            } else {
              globalLogger.error('[SHARD SYNC] Non-retryable error during shard sync delete', {
                resource: `${entry.resourceType}/${entry.resourceId}`,
                error,
              });
              stats.errors++;
              consecutiveErrors++;
              if (consecutiveErrors >= errorThreshold) {
                throw new Error('[SHARD SYNC] Global shard unavailable: too many consecutive errors');
              }
            }
          }
          continue;
        }

        const resource = JSON.parse(shardResource.content);

        // Write to global with per-resource error handling
        try {
          await destinationRepo.syncResourceFromShard(resource);
          successOutboxIds.push(...entry.outboxIds);
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
    if (successOutboxIds.length > 0) {
      await new SqlBuilder('DELETE FROM "shard_sync_outbox_attempts" WHERE "outbox_id" = ANY($1)', [
        successOutboxIds,
      ]).execute(sourceClient);
      await new SqlBuilder('DELETE FROM "shard_sync_outbox" WHERE "id" = ANY($1)', [successOutboxIds]).execute(
        sourceClient
      );
    }

    if (failedOutboxIds.length > 0) {
      // Record attempts for failed rows
      await new SqlBuilder(
        `INSERT INTO "shard_sync_outbox_attempts" ("outbox_id", "attemptedAt")
         SELECT unnest($1::bigint[]), NOW()`,
        [failedOutboxIds]
      ).execute(sourceClient);

      // Move rows that have exceeded maxAttempts to deadletter
      const { rows: movedRows } = await new SqlBuilder(
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
      ).execute<{ outbox_id: string }>(sourceClient);
      const deadletterOutboxIds = movedRows.map((r) => r.outbox_id);
      if (deadletterOutboxIds.length > 0) {
        stats.deadletter += deadletterOutboxIds.length;
        await new SqlBuilder('DELETE FROM "shard_sync_outbox" WHERE "id" = ANY($1)', [deadletterOutboxIds]).execute(
          sourceClient
        );
      }
    }

    return outboxRows.length;
  });
}

export function getShardSyncQueue(): Queue<ShardSyncJobData> | undefined {
  return queueRegistry.get(queueName);
}

async function addShardSyncJobData(jobData: ShardSyncJobData, opts?: JobsOptions): Promise<Job<ShardSyncJobData>> {
  const queue = getShardSyncQueue();
  if (!queue) {
    throw new Error(`Job queue ${queueName} not available`);
  }
  return queue.add('ShardSyncJobData', jobData, {
    deduplication: { id: jobData.shardId },
    ...opts,
  });
}

export async function addShardSyncJob(shardId: string): Promise<Job<ShardSyncJobData>> {
  const jobData = prepareShardSyncJobData(shardId);
  // Delay in conjunction with deduplication above to debounce the shard-sync worker since sync jobs tend to be bursty
  return addShardSyncJobData(jobData, { delay: 1000 });
}

export function prepareShardSyncJobData(shardId: string): ShardSyncJobData {
  const ctx = tryGetRequestContext();

  return {
    shardId,
    requestId: ctx?.requestId,
    traceId: ctx?.traceId,
  };
}
