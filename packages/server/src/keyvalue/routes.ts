// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getStatus, normalizeErrorString, normalizeOperationOutcome, singularize } from '@medplum/core';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { authenticateRequest } from '../oauth/middleware';
import { deleteValue, getValue, setValue } from './store';

export const keyValueRouter = Router();
keyValueRouter.use(authenticateRequest);

keyValueRouter.get('/:key', async (req: Request, res: Response) => {
  const key = singularize(req.params.key) ?? '';
  try {
    const value = await getValue(key);
    res.status(200).send(value);
  } catch (err) {
    const outcome = normalizeOperationOutcome(err);
    res.status(getStatus(outcome)).send(normalizeErrorString(outcome));
  }
});

keyValueRouter.put('/:key', async (req: Request, res: Response) => {
  const key = singularize(req.params.key) ?? '';
  try {
    await setValue(key, req.body);
    res.sendStatus(204);
  } catch (err) {
    const outcome = normalizeOperationOutcome(err);
    res.status(getStatus(outcome)).send(normalizeErrorString(outcome));
  }
});

keyValueRouter.delete('/:key', async (req: Request, res: Response) => {
  const key = singularize(req.params.key) ?? '';
  try {
    await deleteValue(key);
    res.sendStatus(204);
  } catch (err) {
    const outcome = normalizeOperationOutcome(err);
    res.status(getStatus(outcome)).send(normalizeErrorString(outcome));
  }
});
