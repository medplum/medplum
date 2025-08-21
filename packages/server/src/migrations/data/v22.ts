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
  await fns.idempotentCreateIndex(client, results, 'ServiceRequest___reasonCode_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "ServiceRequest___reasonCode_idx" ON "ServiceRequest" USING gin ("__reasonCode")`);
  await fns.idempotentCreateIndex(client, results, 'ServiceRequest___reasonCodeTextTrgm_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "ServiceRequest___reasonCodeTextTrgm_idx" ON "ServiceRequest" USING gin (token_array_to_text("__reasonCodeText") gin_trgm_ops)`);
}
