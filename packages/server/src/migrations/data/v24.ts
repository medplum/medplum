// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { WithId } from '@medplum/core';
import { AsyncJob, ResourceType } from '@medplum/fhirtypes';
import { prepareReindexJobData, ReindexJob, ReindexPostDeployMigration } from '../../workers/reindex';

// Repository.VERSION was bumped to 10 for the HumanName sort columns,
// so reindex all resources with a lower version.
const maxResourceVersion = 9;

export const migration: ReindexPostDeployMigration = {
  type: 'reindex',
  prepareJobData(asyncJob: WithId<AsyncJob>) {
    const resourceTypes: ResourceType[] = ['Patient', 'Person', 'Practitioner', 'RelatedPerson'];
    return prepareReindexJobData(resourceTypes, asyncJob.id, undefined, maxResourceVersion);
  },
  run: async (repo, job, jobData) => {
    return new ReindexJob(repo).execute(job, jobData);
  },
};
