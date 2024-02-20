import { allOk } from '@medplum/core';
import { AsyncJob } from '@medplum/fhirtypes';
import { Request, Response, Router } from 'express';
import { asyncWrap } from '../async';
import { getAuthenticatedContext } from '../context';
import { sendResponse } from './response';

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

    if (!finalJobStatusCodes.includes(asyncJob.status as string)) {
      res.status(202).end();
      return;
    }

    await sendResponse(req, res, allOk, asyncJob);
  })
);

jobRouter.delete('/:id/status', (req: Request, res: Response) => {
  res.sendStatus(202);
});
