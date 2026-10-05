// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { PoolClient } from 'pg';
import { PLACEHOLDER_SHARD_ID } from '../../fhir/sharding';
import { reloadCronBots } from '../../workers/cron';
import { prepareCustomMigrationJobData, runCustomMigration } from '../../workers/post-deploy-migration';
import type { MigrationActionResult } from '../types';
import type { CustomPostDeployMigration } from './types';

export const migration: CustomPostDeployMigration = {
  type: 'custom',
  prepareJobData: (asyncJob) => ({ ...prepareCustomMigrationJobData(asyncJob), skipInFirstBootMode: true }),
  run: async (repo, job, jobData) => runCustomMigration(repo, job, jobData, callback),
};

// Cron schedulers keep the job data they were registered with, so ones registered before v5.1.40 lack the
// `target` that the cron worker now requires; reloading re-registers every schedule with current job data
async function callback(_client: PoolClient, results: MigrationActionResult[]): Promise<void> {
  const start = Date.now();
  await reloadCronBots(PLACEHOLDER_SHARD_ID);
  results.push({ name: 'reloadCronBots', durationMs: Date.now() - start });
}
