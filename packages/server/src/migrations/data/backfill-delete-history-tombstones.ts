// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getResourceTypes, sleep } from '@medplum/core';
import type { ResourceType } from '@medplum/fhirtypes';
import type { PoolClient } from 'pg';
import type { PgQueryable } from '../../fhir/sql';
import { PostgresError } from '../../fhir/sql';
import { globalLogger } from '../../logger';
import type { MigrationActionResult } from '../types';

export const DELETE_HISTORY_TOMBSTONE_BACKFILL_BATCH_SIZE = 1000;

// lastUpdated string matches Date.toISOString() (UTC, ms precision, FF3 + Z).
const LAST_UPDATED_ISO_SQL = `to_char(date_trunc('milliseconds', h."lastUpdated") AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"')`;

/**
 * Backfill legacy delete-history rows (content = '') with a minimal tombstone.
 *
 * Selects history rows with empty content and joins to the latest prior
 * non-empty history row for the same id (latest lastUpdated before the delete
 * row, then highest versionId). The lateral join returns at most one row.
 *
 * meta.author is omitted for legacy rows because the delete actor was not stored.
 * Tombstones are jsonb_build_object::text, so key order differs from buildDeleteHistoryContent;
 * history rows are read via JSON.parse only, not byte comparison.
 * @param resourceType - The resource type to backfill.
 * @param batchSize - The number of rows to process in each batch.
 * @returns The SQL to backfill the delete history tombstones.
 */
export function buildBackfillDeleteHistoryTombstonesSql(
  resourceType: string,
  batchSize: number = DELETE_HISTORY_TOMBSTONE_BACKFILL_BATCH_SIZE
): string {
  const historyTable = `${resourceType}_History`;
  return `WITH batch AS (
  SELECT
    h."versionId",
    COALESCE(orig.content->>'resourceType', '${resourceType}') AS "resourceType",
    COALESCE(orig.content->>'id', h.id::text) AS "resourceId",
    ${LAST_UPDATED_ISO_SQL} AS "lastUpdatedIso",
    orig.content->'meta'->>'project' AS project
  FROM "${historyTable}" AS h
  LEFT JOIN LATERAL (
    SELECT prev.content::jsonb AS content
    FROM "${historyTable}" AS prev
    WHERE prev.id = h.id
      AND prev.content <> ''
      AND prev."lastUpdated" < h."lastUpdated"
    ORDER BY prev."lastUpdated" DESC, prev."versionId" DESC
    LIMIT 1
  ) AS orig ON true
  WHERE h.content = ''
  LIMIT ${batchSize}
)
  UPDATE "${historyTable}" AS h
    SET content = (
      jsonb_build_object(
        'resourceType', batch."resourceType",
        'id', batch."resourceId",
        'meta',
        jsonb_build_object(
          'versionId', batch."versionId",
          'lastUpdated', batch."lastUpdatedIso",
          'deleted', true
        ) || CASE
          WHEN batch.project IS NOT NULL
          THEN jsonb_build_object('project', batch.project)
          ELSE '{}'::jsonb
        END
      )
    )::text
  FROM batch
  WHERE h."versionId" = batch."versionId"`;
}

/** Where to resume: at this resource type, or after all types have been processed. */
export type DeleteHistoryTombstoneCheckpoint = { readonly resourceType: ResourceType } | { readonly done: true };

export interface BackfillDeleteHistoryTombstoneOptions {
  readonly batchSize?: number;
  /** Milliseconds to pause between batches, giving replicas and autovacuum time to keep up with the rewrite. */
  readonly delayBetweenBatches?: number;
  readonly checkpoint?: DeleteHistoryTombstoneCheckpoint;
  readonly onCheckpoint?: (checkpoint: DeleteHistoryTombstoneCheckpoint) => Promise<void>;
}

const defaultOptions: Required<Pick<BackfillDeleteHistoryTombstoneOptions, 'batchSize' | 'delayBetweenBatches'>> = {
  batchSize: DELETE_HISTORY_TOMBSTONE_BACKFILL_BATCH_SIZE,
  delayBetweenBatches: 100,
};

const maxBatchAttempts = 2;

function isDedicatedClient(client: PgQueryable): client is PoolClient {
  return 'release' in client;
}

const pgUpdatedRowCount = (result: { rowCount: number | null }): number => result.rowCount ?? 0;

async function runBatch(client: PgQueryable, sql: string): Promise<number> {
  if (!isDedicatedClient(client)) {
    const result = await client.query(sql);
    return pgUpdatedRowCount(result);
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxBatchAttempts; attempt++) {
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    try {
      const result = await client.query(sql);
      await client.query('COMMIT');
      return pgUpdatedRowCount(result);
    } catch (err: any) {
      await client.query('ROLLBACK');
      if (err?.code !== PostgresError.SerializationFailure) {
        throw err;
      }
      lastError = err;
      if (attempt < maxBatchAttempts) {
        globalLogger.warn('Retrying delete history tombstone backfill batch after serialization failure', {
          error: err.message,
        });
      }
    }
  }
  throw lastError;
}

export async function backfillDeleteHistoryTombstonesForResourceType(
  client: PgQueryable,
  results: MigrationActionResult[],
  resourceType: string,
  batchSize: number = DELETE_HISTORY_TOMBSTONE_BACKFILL_BATCH_SIZE
): Promise<void> {
  await backfillDeleteHistoryTombstonesForResourceTypeWithOptions(client, results, resourceType, {
    batchSize,
    delayBetweenBatches: 0,
  });
}

async function backfillDeleteHistoryTombstonesForResourceTypeWithOptions(
  client: PgQueryable,
  results: MigrationActionResult[],
  resourceType: string,
  options: Required<Pick<BackfillDeleteHistoryTombstoneOptions, 'batchSize' | 'delayBetweenBatches'>> &
    Pick<BackfillDeleteHistoryTombstoneOptions, 'onCheckpoint'>
): Promise<void> {
  const { batchSize, delayBetweenBatches, onCheckpoint } = options;
  const sql = buildBackfillDeleteHistoryTombstonesSql(resourceType, batchSize);
  const start = Date.now();
  let iterations = 0;
  let rowsProcessed = 0;
  let hasMore = true;

  while (hasMore) {
    const batchStart = Date.now();
    const rowsThisBatch = await runBatch(client, sql);
    if (rowsThisBatch === 0) {
      break;
    }
    iterations++;
    rowsProcessed += rowsThisBatch;
    hasMore = rowsThisBatch === batchSize;

    globalLogger.info('Backfill delete history tombstones progress', {
      resourceType,
      batch: iterations,
      rowsThisBatch,
      rowsProcessed,
      elapsedMs: Date.now() - start,
      batchDurationMs: Date.now() - batchStart,
    });

    if (hasMore) {
      await onCheckpoint?.({ resourceType: resourceType as ResourceType });
      if (delayBetweenBatches > 0) {
        await sleep(delayBetweenBatches);
      }
    }
  }

  if (iterations > 0 || rowsProcessed > 0) {
    const durationMs = Date.now() - start;
    globalLogger.info('Backfill delete history tombstones completed for resource type', {
      resourceType,
      iterations,
      rowsProcessed,
      durationMs,
    });
    results.push({
      name: `backfill-delete-history-tombstones:${resourceType}`,
      durationMs,
      iterations,
      rowsProcessed,
    });
  }
}

/**
 * Backfills delete-history tombstones for every FHIR resource type, with optional checkpointing and pacing.
 * @param client - The database client.
 * @param results - The list of action results to push operations performed.
 * @param options - Batching, pacing, and checkpointing overrides.
 */
export async function backfillDeleteHistoryTombstones(
  client: PoolClient,
  results: MigrationActionResult[],
  options?: BackfillDeleteHistoryTombstoneOptions
): Promise<void> {
  const { batchSize, delayBetweenBatches, checkpoint, onCheckpoint } = {
    ...defaultOptions,
    ...options,
  };

  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error(`Invalid delete history tombstone backfill batch size: ${batchSize}`);
  }

  if (checkpoint && 'done' in checkpoint) {
    results.push({
      name: 'Backfill delete history tombstones',
      durationMs: 0,
      skipped: 'Already completed',
    });
    return;
  }

  const resourceTypes = getResourceTypes();
  const startIndex = checkpoint ? resourceTypes.indexOf(checkpoint.resourceType) : 0;
  if (startIndex < 0) {
    throw new Error(`Invalid delete history tombstone backfill checkpoint: ${JSON.stringify(checkpoint)}`);
  }
  if (checkpoint) {
    globalLogger.info('Resuming delete history tombstone backfill', checkpoint);
  }

  for (let i = startIndex; i < resourceTypes.length; i++) {
    const resourceType = resourceTypes[i];
    await backfillDeleteHistoryTombstonesForResourceTypeWithOptions(client, results, resourceType, {
      batchSize,
      delayBetweenBatches,
      onCheckpoint,
    });

    const nextResourceType = resourceTypes[i + 1];
    await onCheckpoint?.(nextResourceType ? { resourceType: nextResourceType } : { done: true });
  }
}
