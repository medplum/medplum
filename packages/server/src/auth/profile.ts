import { Login } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { invalidRequest, sendOutcome } from '../fhir/outcomes';
import { systemRepo } from '../fhir/repo';
import { setLoginMembership } from '../oauth/utils';
import { sendLoginCookie } from './utils';

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

  const login = await systemRepo.readResource<Login>('Login', req.body.login);

  // Update the login
  const updated = await setLoginMembership(login, req.body.profile);

  // Send login cookie
  sendLoginCookie(res, login);

  // Send code
  res.status(200).json({
    login: updated.id,
    code: updated.code,
  });
}
