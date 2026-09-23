// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ReindexPostDeployMigration } from '../../workers/reindex';
import { prepareReindexJobData, ReindexJob } from '../../workers/reindex';

// Repository.VERSION was bumped to 7 for this migration
const maxResourceVersion = 7 - 1;
export const migration: ReindexPostDeployMigration = {
  type: 'reindex',
  prepareJobData(ctx) {
    return prepareReindexJobData(ctx, ['AllergyIntolerance', 'Immunization', 'ProjectMembership'], {
      maxResourceVersion,
    });
  },
  run: async (_repo, job, jobData) => {
    return (await ReindexJob.create(jobData)).execute(job);
  },
};
