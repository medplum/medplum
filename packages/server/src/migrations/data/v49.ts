// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { sleep } from '@medplum/core';
import type { PoolClient } from 'pg';
import { globalLogger } from '../../logger';
import { prepareCustomMigrationJobData, runCustomMigration } from '../../workers/post-deploy-migration';
import type { MigrationActionResult } from '../types';
import type { CustomPostDeployMigration } from './types';

export const migration: CustomPostDeployMigration = {
  type: 'custom',
  prepareJobData: (asyncJob) => prepareCustomMigrationJobData(asyncJob),
  run: async (repo, job, jobData) =>
    runCustomMigration(repo, job, jobData, (client, results) => backfillHumanNameProjectId(client, results)),
};

export interface BackfillOptions {
  /** Resources scanned per statement. Bounds how long any single row lock is held. */
  readonly batchSize?: number;
  /** Milliseconds to pause between batches, giving replicas and autovacuum time to keep up with the rewrite. */
  readonly delayBetweenBatches?: number;
  /** Log progress each time this many more resources of a type have been scanned. */
  readonly progressLogThreshold?: number;
}

const defaultOptions: Required<BackfillOptions> = {
  batchSize: 5000,
  delayBetweenBatches: 100,
  progressLogThreshold: 100_000,
};

const resourceTypes = ['Patient', 'Person', 'Practitioner', 'RelatedPerson'] as const;

/**
 * Copies each resource's `projectId` onto its `HumanName` rows, covering rows written before the column existed.
 *
 * Paginates by resource `id` so each batch is a primary key range scan joined to `HumanName` via its `resourceId`
 * index, rather than re-selecting `projectId IS NULL` rows each pass, which is not indexed and would rescan the table.
 * Matches on `IS DISTINCT FROM` so stale values are corrected too, and re-running is safe.
 * @param client - The database client.
 * @param results - The list of action results to push operations performed.
 * @param options - Batching, pacing, and logging overrides.
 */
export async function backfillHumanNameProjectId(
  client: PoolClient,
  results: MigrationActionResult[],
  options?: BackfillOptions
): Promise<void> {
  const { batchSize, delayBetweenBatches, progressLogThreshold } = { ...defaultOptions, ...options };

  for (const resourceType of resourceTypes) {
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

    let lastId = '00000000-0000-0000-0000-000000000000';
    let scanned = 0;
    let updated = 0;
    for (;;) {
      const result = await client.query<{ maxId: string | null; scanned: number; updated: number }>(sql, [
        lastId,
        batchSize,
      ]);
      const row = result.rows[0];
      if (!row.scanned || !row.maxId) {
        break;
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

      // A partial batch means the end of the table was reached
      if (row.scanned < batchSize) {
        break;
      }
      if (delayBetweenBatches > 0) {
        await sleep(delayBetweenBatches);
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
  }
}
