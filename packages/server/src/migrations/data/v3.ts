// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getResourceTypes } from '@medplum/core';
import type { ReindexPostDeployMigration } from '../../workers/reindex';
import { prepareReindexJobData, ReindexJob } from '../../workers/reindex';

// Repository.VERSION was bumped to 3 for token-column search parameters,
// so reindex all resources with a lower version.
const maxResourceVersion = 2;

export const migration: ReindexPostDeployMigration = {
  type: 'reindex',
  prepareJobData(ctx) {
    return prepareReindexJobData(
      ctx,
      getResourceTypes().filter((rt) => rt !== 'Binary'),
      {
        maxResourceVersion,
      }
    );
  },
  run: async (_repo, job, jobData) => {
    return (await ReindexJob.create(jobData)).execute(job);
  },
};
