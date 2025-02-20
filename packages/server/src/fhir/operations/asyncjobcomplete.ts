import { allOk, assert, badRequest } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { AsyncJob, OperationDefinition } from '@medplum/fhirtypes';
import { requireSuperAdmin } from '../../admin/super';
import { getAuthenticatedContext } from '../../context';
import { getSystemRepo } from '../repo';
import { AsyncJobExecutor } from './utils/asyncjobexecutor';

export const operation: OperationDefinition = {
  id: 'AsyncJob-complete',
  resourceType: 'OperationDefinition',
  name: 'asyncjob-complete',
  status: 'active',
  kind: 'operation',
  code: 'complete',
  experimental: true,
  resource: ['AsyncJob'],
  system: false,
  type: false,
  instance: true,
  parameter: [{ use: 'out', name: 'return', type: 'OperationOutcome', min: 1, max: '1' }],
};

/**
 * Handles HTTP requests for the AsyncJob $complete operation.
 * Runs the `AsyncJobExecutor.completeJob` class method on this job and marks the job as completed.
 *
 * @param req - A request to complete a particular async job.
 * @returns A FhirResponse.
 */
export async function asyncJobCompleteHandler(req: FhirRequest): Promise<FhirResponse> {
  assert(req.params.id, 'This operation can only be executed on an instance');
  requireSuperAdmin();

  const { repo } = getAuthenticatedContext();
  const job = await repo.readResource<AsyncJob>('AsyncJob', req.params.id);
  if (job.status !== 'accepted') {
    return [badRequest(`AsyncJob cannot be completed if status is not 'accepted', job has status '${job.status}'`)];
  }
  // We update with system repo so that system is the author
  const systemRepo = getSystemRepo();
  await new AsyncJobExecutor(systemRepo, job).completeJob(systemRepo);
  return [allOk];
}
