// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { badRequest, OperationOutcomeError } from '@medplum/core';
import type { Login } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { body } from 'express-validator';
import { getGlobalSystemRepo } from '../fhir/repo';
import { makeValidationMiddleware } from '../util/validator';
import { sendLoginResult } from './utils';

/*
 * The reason handler is used during login when the project requires a login reason.
 * The client will submit the reason, and the server will update the login.
 */

export const reasonValidator = makeValidationMiddleware([
  body('login').isUUID().withMessage('Missing login'),
  body('reason')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Missing reason')
    .isLength({ max: 1024 })
    .withMessage('Reason too long'),
]);

export async function reasonHandler(req: Request, res: Response): Promise<void> {
  const systemRepo = getGlobalSystemRepo();
  const login = await systemRepo.readResource<Login>('Login', req.body.login);

  if (login.revoked) {
    throw new OperationOutcomeError(badRequest('Login revoked'));
  }

  if (login.granted) {
    throw new OperationOutcomeError(badRequest('Login granted'));
  }

  const updated = await systemRepo.updateResource<Login>({ ...login, reason: req.body.reason });
  await sendLoginResult(res, updated);
}
