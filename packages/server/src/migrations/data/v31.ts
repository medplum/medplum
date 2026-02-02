// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getShardSystemRepo } from '../../fhir/repo';
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
async function callback(client: ShardPoolClient, results: MigrationActionResult[]): Promise<void> {
  const repo = getShardSystemRepo(client.shardId, client);
  const start = Date.now();
  await rebuildR4ValueSets(repo);
  results.push({ name: 'rebuildR4ValueSets', durationMs: Date.now() - start });
}
