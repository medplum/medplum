// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, assert, badRequest } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { AsyncJob, OperationDefinition } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { getSystemRepo } from '../repo';

export const operation: OperationDefinition = {
  id: 'AsyncJob-cancel',
  resourceType: 'OperationDefinition',
  name: 'asyncjob-cancel',
  status: 'active',
  kind: 'operation',
  code: 'cancel',
  experimental: true,
  resource: ['AsyncJob'],
  system: false,
  type: false,
  instance: true,
  parameter: [{ use: 'out', name: 'return', type: 'OperationOutcome', min: 1, max: '1' }],
};

/**
 * Handles HTTP requests for the AsyncJob $cancel operation.
 * Sets the status of the `AsyncJob` to `cancelled`.
 *
 * @param req - A request to cancel a particular async job.
 * @returns A FhirResponse.
 */
export async function asyncJobCancelHandler(req: FhirRequest): Promise<FhirResponse> {
  assert(req.params.id, 'This operation can only be executed on an instance');
  // Update status of async job
  const { repo } = getAuthenticatedContext();
  // We read with the users repo to make sure they have permissions for this
  const job = await repo.readResource<AsyncJob>('AsyncJob', req.params.id);
  switch (job.status) {
    case 'accepted':
      // We patch with system repo so that AsyncJob is not added to a project
      // This occurs because the behavior when a super admin updates a resource is different depending on whether
      // The `X-Medplum` header is set or not
      // With the header set (ie. `X-Medplum: extended`), the resource will be added to the Super Admin project
      // With the header NOT set, the resource will not be added to any project and remain without a project
      // Using system repo always maintains that the resource is not added to a project
      // Due to it lacking any projects listed in `context.projects`
      await getSystemRepo().patchResource('AsyncJob', req.params.id, [
        { op: 'test', path: '/status', value: 'accepted' },
        { op: 'add', path: '/status', value: 'cancelled' },
      ]);
      break;
    case 'cancelled':
      break;
    default:
      return [badRequest(`AsyncJob cannot be cancelled if status is not 'accepted', job had status '${job.status}'`)];
  }
  return [allOk];
}
