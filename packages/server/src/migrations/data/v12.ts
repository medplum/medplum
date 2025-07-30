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
  await fns.idempotentCreateIndex(client, results, 'AllergyIntolerance_encounter_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "AllergyIntolerance_encounter_idx" ON "AllergyIntolerance" ("encounter")`);
  await fns.idempotentCreateIndex(client, results, 'Immunization_encounter_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Immunization_encounter_idx" ON "Immunization" ("encounter")`);
  await fns.idempotentCreateIndex(client, results, 'ProjectMembership___idnt_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "ProjectMembership___idnt_idx" ON "ProjectMembership" USING gin ("__identifier")`);
  await fns.idempotentCreateIndex(client, results, 'ProjectMembership___idntTextTrgm_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "ProjectMembership___idntTextTrgm_idx" ON "ProjectMembership" USING gin (token_array_to_text("__identifierText") gin_trgm_ops)`);
}
