// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { PoolClient } from 'pg';
import { getShardSystemRepo } from '../../fhir/repo';
import { PLACEHOLDER_SHARD_ID } from '../../fhir/sharding';
import { rebuildR4ValueSets } from '../../seeds/valuesets';
import { prepareCustomMigrationJobData, runCustomMigration } from '../../workers/post-deploy-migration';
import type { MigrationActionResult } from '../types';
import type { CustomPostDeployMigration } from './types';

export const migration: CustomPostDeployMigration = {
  type: 'custom',
  prepareJobData: (asyncJob) => prepareCustomMigrationJobData(asyncJob),
  run: async (repo, job, jobData) => runCustomMigration(repo, job, jobData, callback),
};

// prettier-ignore
async function callback(client: PoolClient, results: MigrationActionResult[]): Promise<void> {
  const repo = getShardSystemRepo(PLACEHOLDER_SHARD_ID, client); // client will eventually know its shard ID
  const start = Date.now();
  await rebuildR4ValueSets(repo);
  results.push({ name: 'rebuildR4ValueSets', durationMs: Date.now() - start });
}
