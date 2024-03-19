import { allOk, notFound } from '@medplum/core';
import { Login } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { body } from 'express-validator';
import { getAuthenticatedContext } from '../context';
import { sendOutcome } from '../fhir/outcomes';
import { getSystemRepo } from '../fhir/repo';
import { revokeLogin } from '../oauth/utils';
import { makeValidationMiddleware } from '../util/validator';

export const revokeValidator = makeValidationMiddleware([
  body('loginId').isUUID().withMessage('Login ID is required.'),
]);

export async function revokeHandler(req: Request, res: Response): Promise<void> {
  const ctx = getAuthenticatedContext();

  const systemRepo = getSystemRepo();
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
