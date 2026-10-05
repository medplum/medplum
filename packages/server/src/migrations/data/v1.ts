// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { getResourceTypes } from '@medplum/core';
import type { AsyncJob } from '@medplum/fhirtypes';
import type { ReindexPostDeployMigration } from '../../workers/reindex';
import { prepareReindexJobData, ReindexJob } from '../../workers/reindex';

export const migration: ReindexPostDeployMigration = {
  type: 'reindex',
  prepareJobData(asyncJob: WithId<AsyncJob>) {
    return prepareReindexJobData(
      getResourceTypes().filter((rt) => rt !== 'Binary'),
      asyncJob,
      {
        maxResourceVersion: 0, // maxResourceVersion of zero makes the filter __version === NULL which is more precise
      }
    );
  },
  run: async (_repo, job, jobData) => {
    return (await ReindexJob.create(jobData)).execute(job);
  },
};
