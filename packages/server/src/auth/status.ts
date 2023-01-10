import { badRequest } from '@medplum/core';
import { Login } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { param, validationResult } from 'express-validator';
import { invalidRequest, sendOutcome } from '../fhir/outcomes';
import { systemRepo } from '../fhir/repo';
import { sendLoginResult } from './utils';

/*
 * The status handler gets an in-process login status.
 * This is used when the user returns from an external login.
 */

export const statusValidators = [param('login').isUUID().withMessage('Login ID is required')];

export async function statusHandler(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    sendOutcome(res, invalidRequest(errors));
    return;
  }

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
