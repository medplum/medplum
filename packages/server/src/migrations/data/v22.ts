// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { PoolClient } from 'pg';
import { prepareCustomMigrationJobData, runCustomMigration } from '../../workers/post-deploy-migration';
import * as fns from '../migrate-functions';
import type { MigrationActionResult } from '../types';
import type { CustomPostDeployMigration } from './types';

export const migration: CustomPostDeployMigration = {
  type: 'custom',
  prepareJobData: (config) => prepareCustomMigrationJobData(config),
  run: async (repo, job, jobData) => runCustomMigration(repo, job, jobData, callback),
};

// prettier-ignore
async function callback(client: PoolClient, results: MigrationActionResult[]): Promise<void> {
  await fns.idempotentCreateIndex(client, results, 'ServiceRequest___reasonCode_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "ServiceRequest___reasonCode_idx" ON "ServiceRequest" USING gin ("__reasonCode")`);
  await fns.idempotentCreateIndex(client, results, 'ServiceRequest___reasonCodeTextTrgm_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "ServiceRequest___reasonCodeTextTrgm_idx" ON "ServiceRequest" USING gin (token_array_to_text("__reasonCodeText") gin_trgm_ops)`);
}
