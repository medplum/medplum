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
  await fns.idempotentCreateIndex(client, results, 'Address_addressUnaccent_idx_tsv', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Address_addressUnaccent_idx_tsv" ON "Address" USING gin (to_tsvector('simple'::regconfig, medplum_unaccent(address)))`);
  await fns.idempotentCreateIndex(client, results, 'Address_postalCodeUnaccent_idx_tsv', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Address_postalCodeUnaccent_idx_tsv" ON "Address" USING gin (to_tsvector('simple'::regconfig, medplum_unaccent("postalCode")))`);
  await fns.idempotentCreateIndex(client, results, 'Address_cityUnaccent_idx_tsv', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Address_cityUnaccent_idx_tsv" ON "Address" USING gin (to_tsvector('simple'::regconfig, medplum_unaccent(city)))`);
  await fns.idempotentCreateIndex(client, results, 'Address_countryUnaccent_idx_tsv', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Address_countryUnaccent_idx_tsv" ON "Address" USING gin (to_tsvector('simple'::regconfig, medplum_unaccent(country)))`);
  await fns.idempotentCreateIndex(client, results, 'Address_stateUnaccent_idx_tsv', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Address_stateUnaccent_idx_tsv" ON "Address" USING gin (to_tsvector('simple'::regconfig, medplum_unaccent(state)))`);
  await fns.idempotentCreateIndex(client, results, 'HumanName_projectId_nameUnaccentTrgm_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "HumanName_projectId_nameUnaccentTrgm_idx" ON "HumanName" USING gin ("projectId", medplum_unaccent(name) gin_trgm_ops)`);
  await fns.idempotentCreateIndex(client, results, 'HumanName_projectId_nameUnaccent_idx_tsv', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "HumanName_projectId_nameUnaccent_idx_tsv" ON "HumanName" USING gin ("projectId", to_tsvector('simple'::regconfig, medplum_unaccent(name)))`);
  await fns.idempotentCreateIndex(client, results, 'HumanName_projectId_givenUnaccentTrgm_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "HumanName_projectId_givenUnaccentTrgm_idx" ON "HumanName" USING gin ("projectId", medplum_unaccent(given) gin_trgm_ops)`);
  await fns.idempotentCreateIndex(client, results, 'HumanName_projectId_givenUnaccent_idx_tsv', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "HumanName_projectId_givenUnaccent_idx_tsv" ON "HumanName" USING gin ("projectId", to_tsvector('simple'::regconfig, medplum_unaccent(given)))`);
  await fns.idempotentCreateIndex(client, results, 'HumanName_projectId_familyUnaccentTrgm_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "HumanName_projectId_familyUnaccentTrgm_idx" ON "HumanName" USING gin ("projectId", medplum_unaccent(family) gin_trgm_ops)`);
  await fns.idempotentCreateIndex(client, results, 'HumanName_projectId_familyUnaccent_idx_tsv', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "HumanName_projectId_familyUnaccent_idx_tsv" ON "HumanName" USING gin ("projectId", to_tsvector('simple'::regconfig, medplum_unaccent(family)))`);
}
