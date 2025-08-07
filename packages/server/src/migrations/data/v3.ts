// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getResourceTypes, WithId } from '@medplum/core';
import { AsyncJob } from '@medplum/fhirtypes';
import { prepareReindexJobData, ReindexJob, ReindexPostDeployMigration } from '../../workers/reindex';

// Repository.VERSION was bumped to 3 for token-column search parameters,
// so reindex all resources with a lower version.
const maxResourceVersion = 2;

export const migration: ReindexPostDeployMigration = {
  type: 'reindex',
  prepareJobData(asyncJob: WithId<AsyncJob>) {
    return prepareReindexJobData(
      getResourceTypes().filter((rt) => rt !== 'Binary'),
      asyncJob.id,
      undefined,
      maxResourceVersion
    );
  },
  run: async (repo, job, jobData) => {
    return new ReindexJob(repo).execute(job, jobData);
  },
};
