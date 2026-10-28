// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { PoolClient, QueryResult } from 'pg';
import { systemResourceProjectId } from '../../constants';
import { prepareCustomMigrationJobData, runCustomMigration } from '../../workers/post-deploy-migration';
import * as fns from '../migrate-functions';
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

/**
 * Fixes `HumanName` rows the v49 backfill left with a NULL `projectId`, so the column can be made NOT NULL.
 *
 * The backfill paginates each resource table once, so a name written by a server still running pre-5.1.43 code after
 * the backfill passed its resource is left NULL. Rows whose resource no longer exists in any of the name-bearing
 * tables are never matched by search, so they are deleted rather than guessed at.
 * @param client - The database client.
 * @param results - The list of action results to push operations performed.
 */
export async function repairNullHumanNameProjectIds(
  client: PoolClient,
  results: MigrationActionResult[]
): Promise<void> {
  // Scans HumanName for NULLs once, then looks up each owning resource by primary key
  const owners = resourceTypes
    .map((t) => `SELECT r.id, r."projectId" FROM "${t}" r JOIN missing m ON r.id = m."resourceId"`)
    .join(' UNION ALL ');
  let start = Date.now();
  const updated = await readCommitted(
    client,
    `WITH missing AS (
      SELECT DISTINCT "resourceId" FROM "HumanName" WHERE "projectId" IS NULL
    ), owners AS (${owners})
    UPDATE "HumanName" h
    SET "projectId" = COALESCE(o."projectId", $1::uuid)
    FROM owners o
    WHERE h."resourceId" = o.id AND h."projectId" IS NULL`,
    [systemResourceProjectId]
  );
  results.push({
    name: 'Set NULL HumanName.projectId from resource',
    durationMs: Date.now() - start,
    updated: updated.rowCount ?? 0,
  });

  const noOwner = resourceTypes.map((t) => `NOT EXISTS (SELECT 1 FROM "${t}" r WHERE r.id = h."resourceId")`);
  start = Date.now();
  const deleted = await readCommitted(
    client,
    `DELETE FROM "HumanName" h WHERE h."projectId" IS NULL AND ${noOwner.join(' AND ')}`
  );
  results.push({
    name: 'Delete NULL HumanName.projectId rows with no resource',
    durationMs: Date.now() - start,
    deleted: deleted.rowCount ?? 0,
  });
}

/**
 * Runs a statement in its own READ COMMITTED transaction.
 *
 * Pool connections default to REPEATABLE READ, where a concurrent write to an affected resource would fail the whole
 * statement; READ COMMITTED skips those rows, whose replacements already carry the right `projectId`.
 * @param client - The database client.
 * @param sql - The statement.
 * @param params - The statement parameters.
 * @returns The query result.
 */
async function readCommitted(client: PoolClient, sql: string, params?: unknown[]): Promise<QueryResult> {
  await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
  try {
    const result = await client.query(sql, params);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}
