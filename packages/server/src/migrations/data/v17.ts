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
  await fns.idempotentCreateIndex(client, results, 'HumanName_nameTrgm_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "HumanName_nameTrgm_idx" ON "HumanName" USING gin (name gin_trgm_ops)`);
  await fns.idempotentCreateIndex(client, results, 'HumanName_givenTrgm_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "HumanName_givenTrgm_idx" ON "HumanName" USING gin (given gin_trgm_ops)`);
  await fns.idempotentCreateIndex(client, results, 'HumanName_familyTrgm_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "HumanName_familyTrgm_idx" ON "HumanName" USING gin (family gin_trgm_ops)`);
}
