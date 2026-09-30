// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { AsyncJob } from '@medplum/fhirtypes';
import type { ReindexPostDeployMigration } from '../../workers/reindex';
import { prepareReindexJobData, ReindexJob } from '../../workers/reindex';

// Repository.VERSION was bumped to 7 for this migration
const maxResourceVersion = 7 - 1;
export const migration: ReindexPostDeployMigration = {
  type: 'reindex',
  prepareJobData(asyncJob: WithId<AsyncJob>) {
    return prepareReindexJobData(['AllergyIntolerance', 'Immunization', 'ProjectMembership'], asyncJob, {
      maxResourceVersion,
    });
  },
  run: async (_repo, job, jobData) => {
    return (await ReindexJob.create(jobData)).execute(job);
  },
};
