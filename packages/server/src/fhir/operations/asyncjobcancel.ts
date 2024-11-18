import { allOk, assert, badRequest } from '@medplum/core';
import { AsyncJob, OperationDefinition } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { asyncWrap } from '../../async';
import { getAuthenticatedContext } from '../../context';
import { sendOutcome } from '../outcomes';

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
 */
export const asyncJobCancelHandler = asyncWrap(async (req: Request, res: Response) => {
  assert(req.params.id, 'This operation can only be executed on an instance');
  // Update status of async job
  const { repo } = getAuthenticatedContext();
  const job = await repo.readResource<AsyncJob>('AsyncJob', req.params.id);
  switch (job.status) {
    case 'accepted':
      await repo.patchResource('AsyncJob', req.params.id, [
        { op: 'test', path: '/status', value: 'accepted' },
        { op: 'add', path: '/status', value: 'cancelled' },
      ]);
      break;
    case 'cancelled':
      break;
    default:
      sendOutcome(
        res,
        badRequest(`AsyncJob cannot be cancelled if status is not 'accepted', job had status '${job.status}'`)
      );
  }
  sendOutcome(res, allOk);
});
