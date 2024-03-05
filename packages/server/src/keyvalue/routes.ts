import { getStatus, normalizeErrorString, normalizeOperationOutcome } from '@medplum/core';
import { Request, Response, Router } from 'express';
import { asyncWrap } from '../async';
import { authenticateRequest } from '../oauth/middleware';
import { deleteValue, getValue, setValue } from './store';

export const keyValueRouter = Router();
keyValueRouter.use(authenticateRequest);

keyValueRouter.get(
  '/:key',
  asyncWrap(async (req: Request, res: Response) => {
    try {
      const value = await getValue(req.params.key);
      res.status(200).send(value);
    } catch (err) {
      const outcome = normalizeOperationOutcome(err);
      res.status(getStatus(outcome)).send(normalizeErrorString(outcome));
    }
  })
);

keyValueRouter.put(
  '/:key',
  asyncWrap(async (req: Request, res: Response) => {
    try {
      await setValue(req.params.key, req.body);
      res.sendStatus(204);
    } catch (err) {
      const outcome = normalizeOperationOutcome(err);
      res.status(getStatus(outcome)).send(normalizeErrorString(outcome));
    }
  })
);

keyValueRouter.delete(
  '/:key',
  asyncWrap(async (req: Request, res: Response) => {
    try {
      await deleteValue(req.params.key);
      res.sendStatus(204);
    } catch (err) {
      const outcome = normalizeOperationOutcome(err);
      res.status(getStatus(outcome)).send(normalizeErrorString(outcome));
    }
  })
);
