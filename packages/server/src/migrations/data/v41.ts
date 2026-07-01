// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getResourceTypes } from '@medplum/core';
import type { PoolClient } from 'pg';
import { prepareCustomMigrationJobData, runCustomMigration } from '../../workers/post-deploy-migration';
import type { MigrationActionResult } from '../types';
import { backfillDeleteHistoryTombstonesForResourceType } from './backfill-delete-history-tombstones';
import type { CustomPostDeployMigration } from './types';

export const migration: CustomPostDeployMigration = {
  type: 'custom',
  prepareJobData: (asyncJob) => prepareCustomMigrationJobData(asyncJob),
  run: async (repo, job, jobData) => runCustomMigration(repo, job, jobData, callback),
};

async function callback(client: PoolClient, results: MigrationActionResult[]): Promise<void> {
  for (const resourceType of getResourceTypes()) {
    await backfillDeleteHistoryTombstonesForResourceType(client, results, resourceType);
  }
}
