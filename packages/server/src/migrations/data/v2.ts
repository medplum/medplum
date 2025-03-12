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
          // Repository.VERSION was bumped to 2 for token-column search parameters,
          // so reindex all resources with a lower version.
          maxResourceVersion: 1,
        },
        isFirstServerStart
      );
    });
  },
};

export default migration;
