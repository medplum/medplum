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
  await fns.idempotentCreateIndex(client, results, 'Task_projectId____tag_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Task_projectId____tag_idx" ON "Task" USING gin ("projectId", "___tag")`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "Task____tag_idx"`)
  await fns.idempotentCreateIndex(client, results, 'Task_projectId____tagTextTrgm_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Task_projectId____tagTextTrgm_idx" ON "Task" USING gin ("projectId", token_array_to_text("___tagText") gin_trgm_ops)`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "Task____tagTextTrgm_idx"`)
  await fns.idempotentCreateIndex(client, results, 'Task_projectId_authoredOn_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Task_projectId_authoredOn_idx" ON "Task" ("projectId", "authoredOn")`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "Task_authoredOn_idx"`)
  await fns.idempotentCreateIndex(client, results, 'Task_projectId___code_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Task_projectId___code_idx" ON "Task" USING gin ("projectId", "__code")`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "Task___code_idx"`)
  await fns.idempotentCreateIndex(client, results, 'Task_projectId___codeTextTrgm_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Task_projectId___codeTextTrgm_idx" ON "Task" USING gin ("projectId", token_array_to_text("__codeText") gin_trgm_ops)`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "Task___codeTextTrgm_idx"`)
  await fns.idempotentCreateIndex(client, results, 'Task_projectId_priority_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Task_projectId_priority_idx" ON "Task" ("projectId", "priority")`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "Task_priority_idx"`)
  await fns.idempotentCreateIndex(client, results, 'Task_projectId_status_lastUpdated_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Task_projectId_status_lastUpdated_idx" ON "Task" ("projectId", "status", "lastUpdated")`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "Task_status_idx"`)
  await fns.idempotentCreateIndex(client, results, 'Task_projectId_dueDate_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Task_projectId_dueDate_idx" ON "Task" ("projectId", "dueDate")`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "Task_dueDate_idx"`)
}
