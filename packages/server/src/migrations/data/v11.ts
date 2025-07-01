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

async function run(client: PoolClient, results: MigrationActionResult[]): Promise<void> {
  await fns.query(client, results, `UPDATE "Coding" SET "isSynonym" = false WHERE "isSynonym" IS NULL`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "Coding" ALTER COLUMN "isSynonym" SET NOT NULL`);

  const prefIdx = 'Coding_preferred_idx';
  await fns.idempotentCreateIndex(
    client,
    results,
    prefIdx,
    `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "${prefIdx}" ON "Coding" (system, code) INCLUDE (id) WHERE NOT "isSynonym"`
  );

  const identIdx = 'Coding_identity_idx';
  await fns.idempotentCreateIndex(
    client,
    results,
    identIdx,
    `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "${identIdx}" ON "Coding" (system, code, display)`
  );
}
