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
  await fns.idempotentCreateIndex(client, results, 'AccessPolicy___idnt_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "AccessPolicy___idnt_idx" ON "AccessPolicy" USING gin ("__identifier")`);
  await fns.idempotentCreateIndex(client, results, 'AccessPolicy___idntTextTrgm_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "AccessPolicy___idntTextTrgm_idx" ON "AccessPolicy" USING gin (token_array_to_text("__identifierText") gin_trgm_ops)`);
}
