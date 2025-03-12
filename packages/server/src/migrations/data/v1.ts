import { getResourceTypes } from '@medplum/core';
import { AsyncJobExecutor } from '../../fhir/operations/utils/asyncjobexecutor';
import { addPostDeployMigrationJob } from '../../workers/post-deploy-migration';
import { ReindexPostDeployMigration } from './types';

const migration: ReindexPostDeployMigration = {
  type: 'reindex',
  run: async (repo, asyncJob, isFirstServerStart) => {
    const exec = new AsyncJobExecutor(repo, asyncJob);
    await exec.run(async (asyncJob) => {
      await addPostDeployMigrationJob(
        {
          type: 'reindex',
          asyncJob,
          resourceTypes: getResourceTypes().filter((rt) => rt !== 'Binary'),
          // This migration predates the __version column. Specifying zero filters
          // for resources with a NULL resource version
          maxResourceVersion: 0,
        },
        isFirstServerStart
      );
    });
  },
};

export default migration;
