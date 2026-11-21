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
  prepareJobData: prepareCustomMigrationJobData,
  run: async (repo, job, jobData) => runCustomMigration(repo, job, jobData, callback),
};

// prettier-ignore
async function callback(client: PoolClient, results: MigrationActionResult[]): Promise<void> {
  await fns.idempotentCreateIndex(client, results, 'Task_projectId_status____tag___code_not_completed_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Task_projectId_status____tag___code_not_completed_idx" ON "Task" USING gin ("projectId", "status", "___tag", "__code") WITH (fastupdate = off) WHERE ((deleted = false) AND (status <> 'completed'::text))`);
}
