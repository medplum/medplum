import { allOk, badRequest } from '@medplum/core';
import { Login } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { invalidRequest, sendOutcome } from '../fhir/outcomes';
import { systemRepo } from '../fhir/repo';
import { revokeLogin } from '../oauth/utils';

export const revokeValidators = [body('loginId').isUUID().withMessage('Login ID is required.')];

export async function revokeHandler(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    sendOutcome(res, invalidRequest(errors));
    return;
  }

  const login = await systemRepo.readResource<Login>('Login', req.body.loginId);

  // Make sure the login belongs to the current user
  if (login.user?.reference !== 'User/' + res.locals.user) {
    sendOutcome(res, badRequest('Invalid login ID'));
    return;
  }

  // Mark the login as revoked
  await revokeLogin(login);

  sendOutcome(res, allOk);
}
