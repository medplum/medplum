import { AsyncJob } from '@medplum/fhirtypes';
import { Request, Response, Router } from 'express';
import { asyncWrap } from '../async';
import { Repository } from './repo';
import { allOk } from '@medplum/core';

// Asychronous API
// https://hl7.org/fhir/R4/async.html
// https://hl7.org/fhir/async-bundle.html

export const asyncJobRouter = Router();

asyncJobRouter.get(
  '/:id',
  asyncWrap(async (req: Request, res: Response) => {
    const { id } = req.params;
    const repo = res.locals.repo as Repository;
    const asyncJob = await repo.readResource<AsyncJob>('AsyncJob', id);

    if (asyncJob.status !== 'completed') {
      res.status(202).end();
      return;
    }

    res.status(200).type('application/json').json(allOk);
  })
);

asyncJobRouter.delete('/:id', (req: Request, res: Response) => {
  res.sendStatus(202);
});
