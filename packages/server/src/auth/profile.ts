import { Login } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { body } from 'express-validator';
import { getSystemRepo } from '../fhir/repo';
import { setLoginMembership } from '../oauth/utils';
import { makeValidationMiddleware } from '../util/validator';
import { sendLoginCookie } from './utils';

/*
 * The profile handler is used during login when a user has multiple profiles.
 * The client will submit the profile id and the server will update the login.
 */

export const profileValidator = makeValidationMiddleware([
  body('login').exists().withMessage('Missing login'),
  body('profile').exists().withMessage('Missing profile'),
]);

export async function profileHandler(req: Request, res: Response): Promise<void> {
  const systemRepo = getSystemRepo();
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
