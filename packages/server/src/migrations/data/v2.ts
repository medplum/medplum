import { getResourceTypes } from '@medplum/core';
import { AsyncJobExecutor } from '../../fhir/operations/utils/asyncjobexecutor';
import { addPostDeployMigrationJob } from '../../workers/post-deploy-migration';
import { Migration } from './migration';

// Repository.VERSION was bumped to 2 for token-column search parameters,
// so reindex all resources with a lower version.
const maxResourceVersion = 1;

export const run: Migration['run'] = async (repo, asyncJob, isFirstServerStart) => {
  const exec = new AsyncJobExecutor(repo, asyncJob);
  await exec.run(async (asyncJob) => {
    await addPostDeployMigrationJob(
      {
        type: 'reindex',
        asyncJob,
        resourceTypes: getResourceTypes().filter((rt) => rt !== 'Binary'),
        maxResourceVersion,
      },
      isFirstServerStart
    );
  });
};
