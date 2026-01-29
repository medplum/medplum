// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getResourceTypes } from '@medplum/core';
import type { ReindexPostDeployMigration } from '../../workers/reindex';
import { prepareReindexJobData, ReindexJob } from '../../workers/reindex';

// Repository.VERSION was bumped to 6 for 'column-per-code' search parameters,
// so reindex all resources with a lower version.
const maxResourceVersion = 5;

export const migration: ReindexPostDeployMigration = {
  type: 'reindex',
  prepareJobData(config) {
    const resourceTypes = getResourceTypes().filter((rt) => rt !== 'Binary');

    // move typically larger resource types to be handled last to
    // allow opportunity for manually reindexing them while other resource
    // types are being reindexed.
    moveValueToEnd(resourceTypes, 'Task');
    moveValueToEnd(resourceTypes, 'AuditEvent');
    moveValueToEnd(resourceTypes, 'Observation');

    return prepareReindexJobData(config.shardId, resourceTypes, config.asyncJob.id, { maxResourceVersion });
  },
  run: async (repo, job, jobData) => {
    return new ReindexJob(repo).execute(job, jobData);
  },
};

function moveValueToEnd<T>(arr: T[], value: T): void {
  const idx = arr.indexOf(value);
  if (idx !== -1) {
    arr.splice(idx, 1);
    arr.push(value);
  }
}
