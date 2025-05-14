import { PoolClient } from 'pg';
import { prepareCustomMigrationJobData, runCustomMigration } from '../../workers/post-deploy-migration';
import * as fns from '../migrate-functions';
import { withLongRunningDatabaseClient } from '../migration-utils';
import { CustomPostDeployMigration, MigrationActionResult } from './types';

export const migration: CustomPostDeployMigration = {
  type: 'custom',
  prepareJobData: (asyncJob) => prepareCustomMigrationJobData(asyncJob),
  run: async (repo, job, jobData) => {
    return runCustomMigration(repo, job, jobData, async () => {
      return withLongRunningDatabaseClient(async (client) => {
        const actions: MigrationActionResult[] = [];
        await run(client, actions);
        return { actions };
      });
    });
  },
};

async function run(client: PoolClient, actions: MigrationActionResult[]): Promise<void> {
  await fns.idempotentCreateIndex(
    client,
    actions,
    'Flag_status_idx',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Flag_status_idx" ON "Flag" ("status")'
  );
}
