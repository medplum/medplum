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

// prettier-ignore
async function run(client: PoolClient, actions: MigrationActionResult[]): Promise<void> {
  await fns.idempotentCreateIndex(client, actions, 'Group_characteristicReference_idx', 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Group_characteristicReference_idx" ON "Group" USING gin ("characteristicReference")');
}
