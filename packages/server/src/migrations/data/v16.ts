// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { PoolClient } from 'pg';
import { prepareCustomMigrationJobData, runCustomMigration } from '../../workers/post-deploy-migration';
import * as fns from '../migrate-functions';
import { MigrationActionResult } from '../types';
import { CustomPostDeployMigration } from './types';

export const migration: CustomPostDeployMigration = {
  type: 'custom',
  prepareJobData: (asyncJob) => prepareCustomMigrationJobData(asyncJob),
  run: async (repo, job, jobData) => runCustomMigration(repo, job, jobData, callback),
};

async function callback(client: PoolClient, results: MigrationActionResult[]): Promise<void> {
  await fns.query(client, results, `UPDATE "Coding" SET "isSynonym" = false WHERE "isSynonym" IS NULL`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "Coding" ALTER COLUMN "isSynonym" SET NOT NULL`);

  await fns.idempotentCreateIndex(
    client,
    results,
    'Coding_system_code_preferred_idx',
    `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "Coding_system_code_preferred_idx" ON "Coding" ("system", "code") INCLUDE ("id") WHERE ("isSynonym" = false)`
  );
  await fns.idempotentCreateIndex(
    client,
    results,
    'Coding_system_code_display_idx',
    `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "Coding_system_code_display_idx" ON "Coding" ("system", "code", "display")`
  );
}
