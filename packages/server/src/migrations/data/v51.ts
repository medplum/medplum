// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Job } from 'bullmq';
import type { PoolClient } from 'pg';
import { prepareCustomMigrationJobData, runCustomMigration } from '../../workers/post-deploy-migration';
import { moveToDelayedAndThrow, queueRegistry } from '../../workers/utils';
import type { MigrationActionResult } from '../types';
import type { DeleteHistoryTombstoneCheckpoint } from './backfill-delete-history-tombstones';
import { backfillDeleteHistoryTombstones } from './backfill-delete-history-tombstones';
import type { CustomPostDeployMigration, CustomPostDeployMigrationJobData } from './types';

export const migration: CustomPostDeployMigration = {
  type: 'custom',
  prepareJobData: (asyncJob) => prepareCustomMigrationJobData(asyncJob),
  run: async (repo, job, jobData) => runCustomMigration(repo, job, jobData, callback),
};

type V51JobData = CustomPostDeployMigrationJobData & {
  readonly deleteHistoryTombstoneBackfill?: DeleteHistoryTombstoneCheckpoint;
};

async function callback(
  client: PoolClient,
  results: MigrationActionResult[],
  job: Job<CustomPostDeployMigrationJobData> | undefined,
  jobData: V51JobData
): Promise<void> {
  const v51Job = job as Job<V51JobData> | undefined;

  await backfillDeleteHistoryTombstones(client, results, {
    checkpoint: jobData.deleteHistoryTombstoneBackfill,
    onCheckpoint: async (checkpoint) => {
      if (!v51Job) {
        return;
      }
      await v51Job.updateData({ ...v51Job.data, deleteHistoryTombstoneBackfill: checkpoint });
      if (queueRegistry.isClosing(v51Job.queueName)) {
        await moveToDelayedAndThrow(v51Job, 'Delete history tombstone backfill delayed since queue is closing');
      }
    },
  });
}
