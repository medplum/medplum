// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
<<<<<<< HEAD
import type { PoolClient } from 'pg';
import { getShardSystemRepo } from '../../fhir/repo';
import { PLACEHOLDER_SHARD_ID } from '../../fhir/sharding';
=======
import { getShardSystemRepo } from '../../fhir/repo';
>>>>>>> 1ce8099b2 (temp)
import { rebuildR4ValueSets } from '../../seeds/valuesets';
import type { ShardPoolClient } from '../../sharding/sharding-types';
import { prepareCustomMigrationJobData, runCustomMigration } from '../../workers/post-deploy-migration';
import type { MigrationActionResult } from '../types';
import type { CustomPostDeployMigration } from './types';

export const migration: CustomPostDeployMigration = {
  type: 'custom',
  prepareJobData: (asyncJob) => prepareCustomMigrationJobData(asyncJob),
  run: async (repo, job, jobData) => runCustomMigration(repo, job, jobData, callback),
};

// prettier-ignore
<<<<<<< HEAD
async function callback(client: PoolClient, results: MigrationActionResult[]): Promise<void> {
  const repo = getShardSystemRepo(PLACEHOLDER_SHARD_ID, client); // client will eventually know its shard ID
=======
async function callback(client: ShardPoolClient, results: MigrationActionResult[]): Promise<void> {
  const repo = getShardSystemRepo(client.shardId, client);
>>>>>>> 1ce8099b2 (temp)
  const start = Date.now();
  await rebuildR4ValueSets(repo);
  results.push({ name: 'rebuildR4ValueSets', durationMs: Date.now() - start });
}
