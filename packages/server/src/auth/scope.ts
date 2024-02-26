import { Login } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { body } from 'express-validator';
import { getSystemRepo } from '../fhir/repo';
import { setLoginScope } from '../oauth/utils';
import { makeValidationMiddleware } from '../util/validator';

/*
 * The scope handler is used during login to allow a user to select the scope of the login.
 * The client will submit the desired scope, and the server will update the login.
 */

export const scopeValidator = makeValidationMiddleware([
  body('login').exists().withMessage('Missing login'),
  body('scope').exists().withMessage('Missing scope'),
]);

export async function scopeHandler(req: Request, res: Response): Promise<void> {
  const systemRepo = getSystemRepo();
  const login = await systemRepo.readResource<Login>('Login', req.body.login);

  // Update the login
  const updated = await setLoginScope(login, req.body.scope);

  // Send code
  res.status(200).json({
    login: updated.id,
    code: updated.code,
  });
}
