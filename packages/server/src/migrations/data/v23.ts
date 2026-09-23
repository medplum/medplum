// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ResourceType } from '@medplum/fhirtypes';
import type { ReindexPostDeployMigration } from '../../workers/reindex';
import { prepareReindexJobData, ReindexJob } from '../../workers/reindex';

// Repository.VERSION was bumped to 9 for the ServiceRequest.reason-code search parameter,
// so reindex all resources with a lower version.
const maxResourceVersion = 8;

export const migration: ReindexPostDeployMigration = {
  type: 'reindex',
  prepareJobData(ctx) {
    const resourceTypes: ResourceType[] = ['ServiceRequest', 'Task'];
    return prepareReindexJobData(ctx, resourceTypes, { maxResourceVersion });
  },
  run: async (_repo, job, jobData) => {
    return (await ReindexJob.create(jobData)).execute(job);
  },
};
