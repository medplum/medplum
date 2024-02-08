import { badRequest } from '@medplum/core';
import { Login } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { param } from 'express-validator';
import { sendOutcome } from '../fhir/outcomes';
import { getSystemRepo } from '../fhir/repo';
import { makeValidationMiddleware } from '../util/validator';
import { sendLoginResult } from './utils';

/*
 * The status handler gets an in-process login status.
 * This is used when the user returns from an external login.
 */

export const statusValidator = makeValidationMiddleware([param('login').isUUID().withMessage('Login ID is required')]);

export async function statusHandler(req: Request, res: Response): Promise<void> {
  const systemRepo = getSystemRepo();

  const loginId = req.params.login;
  const login = await systemRepo.readResource<Login>('Login', loginId);

  if (login.granted) {
    sendOutcome(res, badRequest('Login already granted'));
    return;
  }

  if (login.revoked) {
    sendOutcome(res, badRequest('Login revoked'));
    return;
  }

  await sendLoginResult(res, login);
}
