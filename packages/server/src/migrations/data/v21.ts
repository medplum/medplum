// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { PoolClient } from 'pg';
import { prepareCustomMigrationJobData, runCustomMigration } from '../../workers/post-deploy-migration';
import * as fns from '../migrate-functions';
import { withLongRunningDatabaseClient } from '../migration-utils';
import { MigrationActionResult } from '../types';
import { CustomPostDeployMigration } from './types';

export const migration: CustomPostDeployMigration = {
  type: 'custom',
  prepareJobData: (asyncJob) => prepareCustomMigrationJobData(asyncJob),
  run: async (repo, job, jobData) => {
    return runCustomMigration(repo, job, jobData, async () => {
      return withLongRunningDatabaseClient(async (client) => {
        const results: MigrationActionResult[] = [];
        await run(client, results);
        return results;
      });
    });
  },
};

// prettier-ignore
async function run(client: PoolClient, results: MigrationActionResult[]): Promise<void> {
  await fns.idempotentCreateIndex(client, results, 'Coding_system_code_display_synonymOf_idx', `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "Coding_system_code_display_synonymOf_idx" ON "Coding" ("system", "code", "display", COALESCE("synonymOf", ('-1'::integer)::bigint))`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "Coding_system_code_display_idx"`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "Coding_system_code_idx"`);
}
