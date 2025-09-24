// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { PoolClient } from 'pg';
import { prepareCustomMigrationJobData, runCustomMigration } from '../../workers/post-deploy-migration';
import * as fns from '../migrate-functions';
import { MigrationActionResult } from '../types';
import { CustomPostDeployMigration } from './types';

export const migration: CustomPostDeployMigration = {
  type: 'custom',
  prepareJobData: (asyncJob) => prepareCustomMigrationJobData(asyncJob),
  run: async (repo, job, jobData) => runCustomMigration(repo, job, jobData, callback),
};

// prettier-ignore
async function callback(client: PoolClient, results: MigrationActionResult[]): Promise<void> {
  await fns.idempotentCreateIndex(client, results, 'Patient___familySort_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Patient___familySort_idx" ON "Patient" ("__familySort")`);
  await fns.idempotentCreateIndex(client, results, 'Patient___givenSort_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Patient___givenSort_idx" ON "Patient" ("__givenSort")`);
  await fns.idempotentCreateIndex(client, results, 'Patient___nameSort_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Patient___nameSort_idx" ON "Patient" ("__nameSort")`);
  await fns.idempotentCreateIndex(client, results, 'Person___nameSort_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Person___nameSort_idx" ON "Person" ("__nameSort")`);
  await fns.idempotentCreateIndex(client, results, 'Practitioner___familySort_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Practitioner___familySort_idx" ON "Practitioner" ("__familySort")`);
  await fns.idempotentCreateIndex(client, results, 'Practitioner___givenSort_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Practitioner___givenSort_idx" ON "Practitioner" ("__givenSort")`);
  await fns.idempotentCreateIndex(client, results, 'Practitioner___nameSort_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Practitioner___nameSort_idx" ON "Practitioner" ("__nameSort")`);
  await fns.idempotentCreateIndex(client, results, 'RelatedPerson___nameSort_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "RelatedPerson___nameSort_idx" ON "RelatedPerson" ("__nameSort")`);
}
