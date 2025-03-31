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
      // Repository.VERSION was bumped to 2 for token-column search parameters,
      // so reindex all resources with a lower version.
      1
    );
  },
  run: async (repo, job, jobData) => {
    return new ReindexJob(repo).execute(job, jobData);
  },
};
