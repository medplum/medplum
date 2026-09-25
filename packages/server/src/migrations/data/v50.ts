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
  await fns.idempotentCreateIndex(client, results, 'HumanName_projectId_name_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "HumanName_projectId_name_idx" ON "HumanName" ("projectId", "name")`);
  await fns.idempotentCreateIndex(client, results, 'HumanName_projectId_given_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "HumanName_projectId_given_idx" ON "HumanName" ("projectId", "given")`);
  await fns.idempotentCreateIndex(client, results, 'HumanName_projectId_family_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "HumanName_projectId_family_idx" ON "HumanName" ("projectId", "family")`);
  await fns.idempotentCreateIndex(client, results, 'HumanName_projectId_nameTrgm_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "HumanName_projectId_nameTrgm_idx" ON "HumanName" USING gin ("projectId", name gin_trgm_ops)`);
  await fns.idempotentCreateIndex(client, results, 'HumanName_projectId_givenTrgm_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "HumanName_projectId_givenTrgm_idx" ON "HumanName" USING gin ("projectId", given gin_trgm_ops)`);
  await fns.idempotentCreateIndex(client, results, 'HumanName_projectId_familyTrgm_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "HumanName_projectId_familyTrgm_idx" ON "HumanName" USING gin ("projectId", family gin_trgm_ops)`);
  await fns.idempotentCreateIndex(client, results, 'HumanName_projectId_name_idx_tsv', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "HumanName_projectId_name_idx_tsv" ON "HumanName" USING gin ("projectId", to_tsvector('simple'::regconfig, name))`);
  await fns.idempotentCreateIndex(client, results, 'HumanName_projectId_given_idx_tsv', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "HumanName_projectId_given_idx_tsv" ON "HumanName" USING gin ("projectId", to_tsvector('simple'::regconfig, given))`);
  await fns.idempotentCreateIndex(client, results, 'HumanName_projectId_family_idx_tsv', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "HumanName_projectId_family_idx_tsv" ON "HumanName" USING gin ("projectId", to_tsvector('simple'::regconfig, family))`);
}
