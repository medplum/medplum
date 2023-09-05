import { allOk } from '@medplum/core';
import { AsyncJob, Bundle } from '@medplum/fhirtypes';
import { Request, Response, Router } from 'express';
import { asyncWrap } from '../async';
import { sendResponse } from './routes';
import { getRequestContext } from '../app';

// Asychronous Job Status API
// https://hl7.org/fhir/async-bundle.html

export const jobRouter = Router();

jobRouter.get(
  '/:id/status',
  asyncWrap(async (req: Request, res: Response) => {
    const ctx = getRequestContext();
    const { id } = req.params;
    const asyncJob = await ctx.repo.readResource<AsyncJob>('AsyncJob', id);

    if (asyncJob.status !== 'completed') {
      res.status(202).end();
      return;
    }

    await sendResponse(res, allOk, {
      resourceType: 'Bundle',
      type: 'batch-response',
      entry: [
        {
          response: {
            status: '200 OK',
            location: asyncJob.request,
          },
        },
      ],
    } as Bundle);
  })
);

jobRouter.delete('/:id/status', (req: Request, res: Response) => {
  res.sendStatus(202);
});
