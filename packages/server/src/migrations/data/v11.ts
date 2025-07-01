import { WithId } from '@medplum/core';
import { AsyncJob } from '@medplum/fhirtypes';
import { prepareReindexJobData, ReindexJob, ReindexPostDeployMigration } from '../../workers/reindex';

// Repository.VERSION was bumped to 7 for this migration
const maxResourceVersion = 7 - 1;
export const migration: ReindexPostDeployMigration = {
  type: 'reindex',
  prepareJobData(asyncJob: WithId<AsyncJob>) {
    return prepareReindexJobData(
      ['AllergyIntolerance', 'Immunization', 'ProjectMembership'],
      asyncJob.id,
      undefined,
      maxResourceVersion
    );
  },
  run: async (repo, job, jobData) => {
    return new ReindexJob(repo).execute(job, jobData);
  },
};
