// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/*
 * This is a generated file
 * Do not edit manually.
 */

import type { PoolClient } from 'pg';
import { prepareCustomMigrationJobData, runCustomMigration } from '../../workers/post-deploy-migration';
import * as fns from '../migrate-functions';
import type { MigrationActionResult } from '../types';
import type { CustomPostDeployMigration } from './types';

export const migration: CustomPostDeployMigration = {
  type: 'custom',
  prepareJobData: (asyncJob) => prepareCustomMigrationJobData(asyncJob),
  run: async (repo, job, jobData) => runCustomMigration(repo, job, jobData, callback),
};

// prettier-ignore
async function callback(client: PoolClient, results: MigrationActionResult[]): Promise<void> {
  await fns.idempotentCreateIndex(client, results, 'ActivityDefinition___code_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "ActivityDefinition___code_idx" ON "ActivityDefinition" USING gin ("__code")`);
  await fns.idempotentCreateIndex(client, results, 'ActivityDefinition___codeTextTrgm_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "ActivityDefinition___codeTextTrgm_idx" ON "ActivityDefinition" USING gin (token_array_to_text("__codeText") gin_trgm_ops)`);
  await fns.idempotentCreateIndex(client, results, 'Communication_priorityOrder_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Communication_priorityOrder_idx" ON "Communication" ("priorityOrder")`);
  await fns.idempotentCreateIndex(client, results, 'Communication_priority_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Communication_priority_idx" ON "Communication" ("priority")`);
  await fns.idempotentCreateIndex(client, results, 'ProjectMembership_active_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "ProjectMembership_active_idx" ON "ProjectMembership" ("active")`);
}
