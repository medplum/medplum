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
  await fns.idempotentCreateIndex(client, results, 'Practitioner_qualificationDavinciPdexWhereValid_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Practitioner_qualificationDavinciPdexWhereValid_idx" ON "Practitioner" USING gin ("qualificationDavinciPdexWhereValid")`);
  await fns.idempotentCreateIndex(client, results, 'ProjectMembership_admin_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "ProjectMembership_admin_idx" ON "ProjectMembership" ("admin")`);
}
