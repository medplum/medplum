import { getResourceTypes, WithId } from '@medplum/core';
import { prepareReindexJobData, ReindexJob, ReindexPostDeployMigration } from '../../workers/reindex';
import { AsyncJob } from '@medplum/fhirtypes';

export const migration: ReindexPostDeployMigration = {
  type: 'reindex',
  prepareJobData(asyncJob: WithId<AsyncJob>) {
    return prepareReindexJobData(
      getResourceTypes().filter((rt) => rt !== 'Binary'),
      asyncJob.id,
      undefined,
      0 // maxResourceVersion of zero makes the filter __version === NULL which is more precise
    );
  },
  run: async (repo, job, jobData) => {
    return new ReindexJob(repo).execute(job, jobData);
  },
};
