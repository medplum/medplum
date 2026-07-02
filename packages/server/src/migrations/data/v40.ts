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
  // Update partial index predicate to prepare for migration to replace Coding_Property unique index
  await fns.idempotentCreateIndex(client, results, 'Coding_Property_reverse_rel_lookup_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Coding_Property_reverse_rel_lookup_idx" ON "Coding_Property" ("target", "property", "coding") WHERE ((target IS NOT NULL) AND (target > 0))`);
  await fns.query(client, results, `DROP INDEX IF EXISTS "Coding_Property_target_property_coding_idx"`);

  await fns.idempotentCreateIndex(client, results, 'ConceptMapping_map_forward_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "ConceptMapping_map_forward_idx" ON "ConceptMapping" ("conceptMap", "sourceSystem", "sourceCode", "targetSystem", "targetCode")`);
}
