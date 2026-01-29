// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ResourceType } from '@medplum/fhirtypes';
import type { ReindexPostDeployMigration } from '../../workers/reindex';
import { prepareReindexJobData, ReindexJob } from '../../workers/reindex';

// Repository.VERSION was bumped to 10 for the HumanName sort columns,
// so reindex all resources with a lower version.
const maxResourceVersion = 9;

export const migration: ReindexPostDeployMigration = {
  type: 'reindex',
  prepareJobData(config) {
    const resourceTypes: ResourceType[] = ['Patient', 'Person', 'Practitioner', 'RelatedPerson'];
    return prepareReindexJobData(config.shardId, resourceTypes, config.asyncJob.id, { maxResourceVersion });
  },
  run: async (repo, job, jobData) => {
    return new ReindexJob(repo).execute(job, jobData);
  },
};
