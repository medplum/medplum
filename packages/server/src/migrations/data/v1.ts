// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getResourceTypes } from '@medplum/core';
import type { ReindexPostDeployMigration } from '../../workers/reindex';
import { prepareReindexJobData, ReindexJob } from '../../workers/reindex';

export const migration: ReindexPostDeployMigration = {
  type: 'reindex',
  prepareJobData(config) {
    return prepareReindexJobData(
      config.shardId,
      getResourceTypes().filter((rt) => rt !== 'Binary'),
      config.asyncJob.id,
      {
        maxResourceVersion: 0, // maxResourceVersion of zero makes the filter __version === NULL which is more precise
      }
    );
  },
  run: async (repo, job, jobData) => {
    return new ReindexJob(repo).execute(job, jobData);
  },
};
