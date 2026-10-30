// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { sleep } from '@medplum/core';
import type { PoolClient } from 'pg';
import { systemResourceProjectId } from '../../constants';
import { prepareCustomMigrationJobData, runCustomMigration } from '../../workers/post-deploy-migration';
import * as fns from '../migrate-functions';
import { runReadCommittedBatch } from '../migration-utils';
import type { MigrationActionResult } from '../types';
import type { CustomPostDeployMigration } from './types';

export const migration: CustomPostDeployMigration = {
  type: 'custom',
  prepareJobData: (asyncJob) => prepareCustomMigrationJobData(asyncJob),
  run: async (repo, job, jobData) => runCustomMigration(repo, job, jobData, callback),
};

// prettier-ignore
async function callback(client: PoolClient, results: MigrationActionResult[]): Promise<void> {
  await repairNullHumanNameProjectIds(client, results);
  await fns.nonBlockingAlterColumnNotNull(client, results, `HumanName`, `projectId`);
}

const resourceTypes = ['Patient', 'Person', 'Practitioner', 'RelatedPerson'] as const;

export interface RepairOptions {
  /** NULL rows selected per statement. Bounds how long any single row lock is held. */
  readonly batchSize?: number;
  /** Milliseconds to pause between batches, giving replicas and autovacuum time to keep up with the rewrite. */
  readonly delayBetweenBatches?: number;
}

const defaultOptions: Required<RepairOptions> = {
  batchSize: 5000,
  delayBetweenBatches: 100,
};

interface RepairBatchResult {
  readonly scanned: number;
  readonly updated: number;
  readonly deleted: number;
}

/**
 * Fixes `HumanName` rows the v49 backfill left with a NULL `projectId`, so the column can be made NOT NULL.
 *
 * The backfill paginates each resource table once, so a name written by a server still running pre-5.1.43 code after
 * the backfill passed its resource is left NULL. Rows whose resource no longer exists in any of the name-bearing
 * tables are never matched by search, so they are deleted rather than guessed at.
 *
 * Batches run under READ COMMITTED, so a concurrent write that replaces a batch's rows skips them rather than failing.
 * Each batch repairs or deletes every row it selects, so re-selecting `projectId IS NULL` always makes progress, and
 * the `projectId` indexes built by v49 keep that lookup from scanning the table.
 * @param client - The database client.
 * @param results - The list of action results to push operations performed.
 * @param options - Batching and pacing overrides.
 */
export async function repairNullHumanNameProjectIds(
  client: PoolClient,
  results: MigrationActionResult[],
  options?: RepairOptions
): Promise<void> {
  const { batchSize, delayBetweenBatches } = { ...defaultOptions, ...options };
  const owners = resourceTypes
    .map((t) => `SELECT r.id, r."projectId" FROM "${t}" r JOIN batch b ON r.id = b."resourceId"`)
    .join(' UNION ALL ');
  const sql = `
    WITH batch AS (
      SELECT DISTINCT "resourceId" FROM (
        SELECT "resourceId" FROM "HumanName" WHERE "projectId" IS NULL LIMIT $2
      ) nulls
    ), owners AS (${owners}),
    updated AS (
      UPDATE "HumanName" h
      SET "projectId" = COALESCE(o."projectId", $1::uuid)
      FROM owners o
      WHERE h."resourceId" = o.id AND h."projectId" IS NULL
      RETURNING 1
    ), deleted AS (
      DELETE FROM "HumanName" h
      USING batch b
      WHERE h."resourceId" = b."resourceId" AND h."projectId" IS NULL
        AND NOT EXISTS (SELECT 1 FROM owners o WHERE o.id = b."resourceId")
      RETURNING 1
    )
    SELECT
      (SELECT count(*)::int FROM batch) AS "scanned",
      (SELECT count(*)::int FROM updated) AS "updated",
      (SELECT count(*)::int FROM deleted) AS "deleted"`;

  const start = Date.now();
  let updated = 0;
  let deleted = 0;
  while (true) {
    const row = await runReadCommittedBatch<RepairBatchResult>(client, sql, [systemResourceProjectId, batchSize]);
    if (row.scanned === 0) {
      break;
    }
    updated += row.updated;
    deleted += row.deleted;
    if (delayBetweenBatches > 0) {
      await sleep(delayBetweenBatches);
    }
  }
  results.push({ name: 'Repair NULL HumanName.projectId', durationMs: Date.now() - start, updated, deleted });
}
