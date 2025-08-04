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
  await fns.idempotentCreateIndex(client, results, 'Coding_Property_full_idx', `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "Coding_Property_full_idx" ON "Coding_Property" ("property", "value", "coding", "target")`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "Coding_Property_idx"`);
  await fns.idempotentCreateIndex(client, results, 'Coding_Property_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Coding_Property_idx" ON "Coding_Property" ("coding", "property")`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "Coding_Property_coding_idx"`);
}
