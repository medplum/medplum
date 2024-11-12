import { accepted, allOk } from '@medplum/core';
import { AsyncJob, OperationOutcome } from '@medplum/fhirtypes';
import { Request, Response, Router } from 'express';
import { asyncWrap } from '../async';
import { getConfig } from '../config';
import { getAuthenticatedContext } from '../context';
import { AsyncJobExecutor } from './operations/utils/asyncjobexecutor';
import { sendFhirResponse } from './response';

// Asychronous Job Status API
// https://hl7.org/fhir/async-bundle.html

export const jobRouter = Router();

const finalJobStatusCodes = ['completed', 'error'];

jobRouter.get(
  '/:id/status',
  asyncWrap(async (req: Request, res: Response) => {
    const ctx = getAuthenticatedContext();
    const { id } = req.params;
    const asyncJob = await ctx.repo.readResource<AsyncJob>('AsyncJob', id);

    let outcome: OperationOutcome;
    if (!finalJobStatusCodes.includes(asyncJob.status as string)) {
      const exec = new AsyncJobExecutor(ctx.repo, asyncJob);
      outcome = accepted(exec.getContentLocation(getConfig().baseUrl));
    } else {
      outcome = allOk;
    }

    return sendFhirResponse(req, res, outcome, asyncJob);
  })
);

jobRouter.delete('/:id/status', (req: Request, res: Response) => {
  res.sendStatus(202);
});
