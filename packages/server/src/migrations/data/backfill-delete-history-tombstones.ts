// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { globalLogger } from '../../logger';
import type { DbClient, MigrationActionResult } from '../types';

export const DELETE_HISTORY_TOMBSTONE_BACKFILL_BATCH_SIZE = 1000;

/*
 * Matches buildDeleteHistoryContent / Date.toISOString(): UTC, 3 ms digits, trailing Z in pure SQL
 * This allows the backfill to use the same format as the Javascript
 */
const LAST_UPDATED_ISO_SQL = `to_char(date_trunc('milliseconds', h."lastUpdated") AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"')`;

/**
 * Backfill legacy delete-history rows (content = '') with a minimal tombstone.
 *
 * Selects history rows with empty content and joins to the immediately prior
 * history row (by lastUpdated) for the same id. Tombstone fields are taken from
 * that prior content where available; delete-version metadata comes from the
 * history row itself.
 *
 * meta.author is omitted for legacy rows because the delete actor was not stored.
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
    SELECT content::jsonb AS content
    FROM "${historyTable}" AS prev
    WHERE prev.id = h.id
      AND prev."lastUpdated" < h."lastUpdated"
    ORDER BY prev."lastUpdated" DESC
    LIMIT 1
  ) AS orig ON true
  WHERE h.content = ''
  ORDER BY h."lastUpdated"
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
  WHERE h."versionId" = batch."versionId"
  RETURNING h."lastUpdated"`;
}

interface BackfillDeleteHistoryTombstoneRow {
  lastUpdated: Date;
}

export async function backfillDeleteHistoryTombstonesForResourceType(
  client: DbClient,
  results: MigrationActionResult[],
  resourceType: string,
  batchSize: number = DELETE_HISTORY_TOMBSTONE_BACKFILL_BATCH_SIZE
): Promise<void> {
  const sql = buildBackfillDeleteHistoryTombstonesSql(resourceType, batchSize);
  const start = Date.now();
  let iterations = 0;
  let rowsProcessed = 0;
  let throughLastUpdated: Date | undefined;

  while (true) {
    const result = await client.query<BackfillDeleteHistoryTombstoneRow>(sql);
    if (result.rowCount === 0) {
      break;
    }
    iterations++;

    const batchThroughLastUpdated = result.rows.reduce(
      (max: Date, row: BackfillDeleteHistoryTombstoneRow) => (row.lastUpdated > max ? row.lastUpdated : max),
      result.rows[0].lastUpdated
    );
    rowsProcessed += result.rowCount ?? 0;
    throughLastUpdated = batchThroughLastUpdated;

    // log progress
    globalLogger.info('Backfill delete history tombstones progress', {
      resourceType,
      batch: iterations,
      rowsThisBatch: result.rowCount,
      throughLastUpdated: batchThroughLastUpdated.toISOString(),
      rowsProcessed,
    });
  }

  results.push({
    name: sql,
    durationMs: Date.now() - start,
    iterations,
    rowsProcessed,
    throughLastUpdated: throughLastUpdated?.toISOString(),
  });
}
