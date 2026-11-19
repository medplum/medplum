// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { AccessPolicyInteraction, allOk, assert, badRequest, forbidden } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { AsyncJob, OperationOutcome } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { makeOperationDefinition } from './definitions';
import type { AsyncJobAccessAction } from './utils/asyncjobexecutor';
import { logAsyncJobAccess, readAsyncJob } from './utils/asyncjobexecutor';

export const operation = makeOperationDefinition(
  { scope: 'instance', resource: 'AsyncJob' },
  {
    id: 'AsyncJob-cancel',
    name: 'asyncjob-cancel',
    code: 'cancel',
    parameter: [{ use: 'out', name: 'return', type: 'OperationOutcome', min: 1, max: '1' }],
  }
);

/**
 * Handles HTTP requests for the AsyncJob $cancel operation.
 * Sets the status of the `AsyncJob` to `cancelled`.
 * Requires write access to the job. A cancel by a user other than its requester or an admin is logged.
 *
 * @param req - A request to cancel a particular async job.
 * @returns A FhirResponse.
 */
export async function asyncJobCancelHandler(req: FhirRequest): Promise<FhirResponse> {
  assert(req.params.id, 'This operation can only be executed on an instance');
  // Update status of async job
  const ctx = getAuthenticatedContext();
  // Access is logged once below, as a cancel only if this request cancels the job
  const job = await readAsyncJob(req.params.id, { logAccess: false });
  // readAsyncJob strips meta.project and policy-hidden fields, so log against the stored job
  const storedJob = await ctx.systemRepo.readResource<AsyncJob>('AsyncJob', job.id);
  let outcome: OperationOutcome = allOk;
  let action: AsyncJobAccessAction = 'read';
  // The system repo patch below checks nothing, so authorize with the caller's repo
  if (!(await ctx.repo.canPerformInteractionById(AccessPolicyInteraction.UPDATE, 'AsyncJob', job.id))) {
    outcome = forbidden;
  } else if (job.status === 'accepted') {
    // We patch with system repo so that AsyncJob is not added to a project
    // This occurs because the behavior when a super admin updates a resource is different depending on whether
    // The `X-Medplum` header is set or not
    // With the header set (ie. `X-Medplum: extended`), the resource will be added to the Super Admin project
    // With the header NOT set, the resource will not be added to any project and remain without a project
    // Using system repo always maintains that the resource is not added to a project
    // Due to it lacking any projects listed in `context.projects`
    await ctx.systemRepo.patchResource('AsyncJob', req.params.id, [
      { op: 'test', path: '/status', value: 'accepted' },
      { op: 'add', path: '/status', value: 'cancelled' },
    ]);
    action = 'cancel';
  } else if (job.status !== 'cancelled') {
    outcome = badRequest(`AsyncJob cannot be cancelled if status is not 'accepted', job had status '${job.status}'`);
  }
  // Logged, not enforced: anyone with write access can cancel, not only the requester and admins
  logAsyncJobAccess(ctx.repo, storedJob, action);
  return [outcome];
}
