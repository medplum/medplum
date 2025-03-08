import { getResourceTypes, WithId } from '@medplum/core';
import { AsyncJob } from '@medplum/fhirtypes';
import { AsyncJobExecutor } from '../../fhir/operations/utils/asyncjobexecutor';
import { Repository } from '../../fhir/repo';
import { addReindexJob } from '../../workers/reindex';

// Repository.VERSION was bumped to 2 for token-column search parameters,
// so reindex all resources with a lower version.
const maxResourceVersion = 1;

export async function run(repo: Repository, asyncJob: WithId<AsyncJob>): Promise<void> {
  const exec = new AsyncJobExecutor(repo, asyncJob);
  await exec.run(async (asyncJob) => {
    await addReindexJob(
      getResourceTypes().filter((rt) => rt !== 'Binary'),
      asyncJob,
      undefined,
      maxResourceVersion
    );
  });
}
