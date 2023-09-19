import { allOk, notFound } from '@medplum/core';
import { Login } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { invalidRequest, sendOutcome } from '../fhir/outcomes';
import { systemRepo } from '../fhir/repo';
import { revokeLogin } from '../oauth/utils';
import { getAuthenticatedContext } from '../context';

export const revokeValidators = [body('loginId').isUUID().withMessage('Login ID is required.')];

export async function revokeHandler(req: Request, res: Response): Promise<void> {
  const ctx = getAuthenticatedContext();
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    sendOutcome(res, invalidRequest(errors));
    return;
  }

  const login = await systemRepo.readResource<Login>('Login', req.body.loginId);

  // Make sure the login belongs to the current user
  if (login.user?.reference !== ctx.membership.user?.reference) {
    sendOutcome(res, notFound);
    return;
  }

  // Mark the login as revoked
  await revokeLogin(login);

  sendOutcome(res, allOk);
}
