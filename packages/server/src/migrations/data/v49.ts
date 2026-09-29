// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { sleep } from '@medplum/core';
import type { Job } from 'bullmq';
import type { PoolClient } from 'pg';
import { PostgresError } from '../../fhir/sql';
import { globalLogger } from '../../logger';
import { prepareCustomMigrationJobData, runCustomMigration } from '../../workers/post-deploy-migration';
import { moveToDelayedAndThrow, queueRegistry } from '../../workers/utils';
import * as fns from '../migrate-functions';
import type { MigrationActionResult } from '../types';
import type { CustomPostDeployMigration, CustomPostDeployMigrationJobData } from './types';

export const migration: CustomPostDeployMigration = {
  type: 'custom',
  prepareJobData: (asyncJob) => prepareCustomMigrationJobData(asyncJob),
  run: async (repo, job, jobData) => runCustomMigration(repo, job, jobData, callback),
};

type V49JobData = CustomPostDeployMigrationJobData & { readonly humanNameBackfill?: BackfillCheckpoint };

// prettier-ignore
async function callback(client: PoolClient, results: MigrationActionResult[], job: Job<CustomPostDeployMigrationJobData> | undefined, jobData: V49JobData): Promise<void> {
  const v49Job = job as Job<V49JobData> | undefined;

  // Backfill before building the indexes, so the rewrite doesn't have to maintain them
  await backfillHumanNameProjectId(client, results, {
    checkpoint: jobData.humanNameBackfill,
    onCheckpoint: async (checkpoint) => {
      if (!v49Job) {
        return;
      }
      // Saved to the job so a re-queued or stalled job resumes from here instead of rescanning every table
      await v49Job.updateData({ ...v49Job.data, humanNameBackfill: checkpoint });
      if (queueRegistry.isClosing(v49Job.queueName)) {
        await moveToDelayedAndThrow(v49Job, 'HumanName.projectId backfill delayed since queue is closing');
      }
    },
  });

  await fns.idempotentCreateIndex(client, results, 'HumanName_projectId_name_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "HumanName_projectId_name_idx" ON "HumanName" ("projectId", "name")`);
  await fns.idempotentCreateIndex(client, results, 'HumanName_projectId_given_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "HumanName_projectId_given_idx" ON "HumanName" ("projectId", "given")`);
  await fns.idempotentCreateIndex(client, results, 'HumanName_projectId_family_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "HumanName_projectId_family_idx" ON "HumanName" ("projectId", "family")`);

  // A multicolumn GIN index serves conditions on any subset of its columns, so each scoped index replaces its unscoped one
  await fns.idempotentCreateIndex(client, results, 'HumanName_projectId_nameTrgm_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "HumanName_projectId_nameTrgm_idx" ON "HumanName" USING gin ("projectId", name gin_trgm_ops)`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "HumanName_nameTrgm_idx"`);
  await fns.idempotentCreateIndex(client, results, 'HumanName_projectId_givenTrgm_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "HumanName_projectId_givenTrgm_idx" ON "HumanName" USING gin ("projectId", given gin_trgm_ops)`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "HumanName_givenTrgm_idx"`);
  await fns.idempotentCreateIndex(client, results, 'HumanName_projectId_familyTrgm_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "HumanName_projectId_familyTrgm_idx" ON "HumanName" USING gin ("projectId", family gin_trgm_ops)`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "HumanName_familyTrgm_idx"`);
  await fns.idempotentCreateIndex(client, results, 'HumanName_projectId_name_idx_tsv', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "HumanName_projectId_name_idx_tsv" ON "HumanName" USING gin ("projectId", to_tsvector('simple'::regconfig, name))`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "HumanName_name_idx_tsv"`);
  await fns.idempotentCreateIndex(client, results, 'HumanName_projectId_given_idx_tsv', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "HumanName_projectId_given_idx_tsv" ON "HumanName" USING gin ("projectId", to_tsvector('simple'::regconfig, given))`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "HumanName_given_idx_tsv"`);
  await fns.idempotentCreateIndex(client, results, 'HumanName_projectId_family_idx_tsv', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "HumanName_projectId_family_idx_tsv" ON "HumanName" USING gin ("projectId", to_tsvector('simple'::regconfig, family))`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "HumanName_family_idx_tsv"`);
}

const resourceTypes = ['Patient', 'Person', 'Practitioner', 'RelatedPerson'] as const;

const minId = '00000000-0000-0000-0000-000000000000';

/** Where to resume the backfill: after `lastId` in one resource type's table, or past the end of all of them. */
export type BackfillCheckpoint =
  { readonly resourceType: (typeof resourceTypes)[number]; readonly lastId: string } | { readonly done: true };

export interface BackfillOptions {
  /** Resources scanned per statement. Bounds how long any single row lock is held. */
  readonly batchSize?: number;
  /** Milliseconds to pause between batches, giving replicas and autovacuum time to keep up with the rewrite. */
  readonly delayBetweenBatches?: number;
  /** Log progress each time this many more resources of a type have been scanned. */
  readonly progressLogThreshold?: number;
  /** Resume from a checkpoint previously passed to `onCheckpoint`. */
  readonly checkpoint?: BackfillCheckpoint;
  /** Called after each batch with the checkpoint to resume from if the backfill is interrupted. */
  readonly onCheckpoint?: (checkpoint: BackfillCheckpoint) => Promise<void>;
}

const defaultOptions: Required<Pick<BackfillOptions, 'batchSize' | 'delayBetweenBatches' | 'progressLogThreshold'>> = {
  batchSize: 5000,
  delayBetweenBatches: 100,
  progressLogThreshold: 100_000,
};

interface BatchResult {
  readonly maxId: string | null;
  readonly scanned: number;
  readonly updated: number;
}

const maxBatchAttempts = 2;

/**
 * Runs one backfill batch in its own READ COMMITTED transaction, retrying on a serialization failure.
 *
 * Pool connections default to REPEATABLE READ, where a concurrent resource write that rewrites a batch's
 * `HumanName` rows fails the whole statement; READ COMMITTED skips those rows, whose replacements already carry
 * the right `projectId`.
 * @param client - The database client.
 * @param sql - The batch statement.
 * @param params - The batch statement parameters.
 * @returns The batch result.
 */
async function runBatch(client: PoolClient, sql: string, params: unknown[]): Promise<BatchResult> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxBatchAttempts; attempt++) {
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    try {
      const result = await client.query<BatchResult>(sql, params);
      await client.query('COMMIT');
      return result.rows[0];
    } catch (err: any) {
      await client.query('ROLLBACK');
      if (err?.code !== PostgresError.SerializationFailure) {
        throw err;
      }
      lastError = err;
      if (attempt < maxBatchAttempts) {
        globalLogger.warn('Retrying HumanName.projectId backfill batch after serialization failure', {
          lastId: params[0],
          error: err.message,
        });
      }
    }
  }
  throw lastError;
}

/**
 * Copies each resource's `projectId` onto its `HumanName` rows, covering rows written before the column existed.
 *
 * Paginates by resource `id` so each batch is a primary key range scan joined to `HumanName` via its `resourceId`
 * index, rather than re-selecting `projectId IS NULL` rows each pass, which is not indexed and would rescan the table.
 * Matches on `IS DISTINCT FROM` so stale values are corrected too, and re-running is safe.
 * @param client - The database client.
 * @param results - The list of action results to push operations performed.
 * @param options - Batching, pacing, logging, and checkpointing overrides.
 */
export async function backfillHumanNameProjectId(
  client: PoolClient,
  results: MigrationActionResult[],
  options?: BackfillOptions
): Promise<void> {
  const { batchSize, delayBetweenBatches, progressLogThreshold, checkpoint, onCheckpoint } = {
    ...defaultOptions,
    ...options,
  };

  // A non-positive batch size would scan nothing, and either loop forever or mark the backfill done without running it
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error(`Invalid HumanName.projectId backfill batch size: ${batchSize}`);
  }

  if (checkpoint && 'done' in checkpoint) {
    results.push({ name: 'Backfill HumanName.projectId', durationMs: 0, skipped: 'Already completed' });
    return;
  }

  const startIndex = checkpoint ? resourceTypes.indexOf(checkpoint.resourceType) : 0;
  if (startIndex < 0) {
    throw new Error(`Invalid HumanName.projectId backfill checkpoint: ${JSON.stringify(checkpoint)}`);
  }
  if (checkpoint) {
    globalLogger.info('Resuming HumanName.projectId backfill', checkpoint);
  }

  for (let i = startIndex; i < resourceTypes.length; i++) {
    const resourceType = resourceTypes[i];
    const start = Date.now();
    const sql = `
      WITH batch AS (
        SELECT id, "projectId"
        FROM "${resourceType}"
        WHERE id > $1
        ORDER BY id
        LIMIT $2
      ), updated AS (
        UPDATE "HumanName" h
        SET "projectId" = b."projectId"
        FROM batch b
        WHERE h."resourceId" = b.id
          AND h."projectId" IS DISTINCT FROM b."projectId"
        RETURNING 1
      )
      SELECT
        (SELECT id FROM batch ORDER BY id DESC LIMIT 1) AS "maxId",
        (SELECT count(*)::int FROM batch) AS "scanned",
        (SELECT count(*)::int FROM updated) AS "updated"`;

    let lastId = i === startIndex && checkpoint ? checkpoint.lastId : minId;
    let scanned = 0;
    let updated = 0;
    let hasMore = true;
    while (hasMore) {
      const row = await runBatch(client, sql, [lastId, batchSize]);
      // A partial batch means the end of the table was reached
      hasMore = row.scanned === batchSize;

      if (row.scanned > 0) {
        // Canonical lowercase UUID strings sort in the same order as Postgres uuids
        if (!row.maxId || row.maxId <= lastId) {
          throw new Error(`HumanName.projectId backfill made no progress on ${resourceType} past ${lastId}`);
        }
        lastId = row.maxId;
        scanned += row.scanned;
        updated += row.updated;

        if (Math.floor(scanned / progressLogThreshold) !== Math.floor((scanned - row.scanned) / progressLogThreshold)) {
          globalLogger.info('HumanName.projectId backfill in progress', {
            resourceType,
            lastId,
            scanned,
            updated,
            durationMs: Date.now() - start,
          });
        }
      }

      if (hasMore) {
        await onCheckpoint?.({ resourceType, lastId });
        if (delayBetweenBatches > 0) {
          await sleep(delayBetweenBatches);
        }
      }
    }

    const durationMs = Date.now() - start;
    globalLogger.info('HumanName.projectId backfill completed', { resourceType, scanned, updated, durationMs });
    results.push({
      name: `Backfill HumanName.projectId from ${resourceType}`,
      durationMs,
      scanned,
      updated,
    });

    const nextResourceType = resourceTypes[i + 1];
    await onCheckpoint?.(nextResourceType ? { resourceType: nextResourceType, lastId: minId } : { done: true });
  }
}
