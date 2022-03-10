import { assertOk } from '@medplum/core';
import { Login } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { invalidRequest, sendOutcome, systemRepo } from '../fhir';
import { setLoginMembership } from '../oauth';

/*
 * The profile handler is used during login when a user has multiple profiles.
 * The client will submit the profile id and the server will update the login.
 */

export const profileValidators = [
  body('login').exists().withMessage('Missing login'),
  body('profile').exists().withMessage('Missing profile'),
];

export async function profileHandler(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    sendOutcome(res, invalidRequest(errors));
    return;
  }

  const [loginOutcome, login] = await systemRepo.readResource<Login>('Login', req.body.login);
  assertOk(loginOutcome, login);

  // Update the login
  const [updateOutcome, updated] = await setLoginMembership(login, req.body.profile);
  assertOk(updateOutcome, updated);

  res.status(200).json({
    login: updated?.id,
    code: updated?.code,
  });
}
