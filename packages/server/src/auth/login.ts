import { assertOk, getReferenceString, Login } from '@medplum/core';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { invalidRequest, sendOutcome } from '../fhir';
import { finalizeLogin, tryLogin } from '../oauth';

export const loginValidators = [
  body('clientId').exists().withMessage('Missing clientId'),
  body('email').isEmail().withMessage('Valid email address is required'),
  body('password').isLength({ min: 5 }).withMessage('Invalid password, must be at least 5 characters'),
  body('scope').notEmpty().withMessage('Missing scope'),
  body('role').notEmpty().withMessage('Missing role'),
];

export async function loginHandler(req: Request, res: Response) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendOutcome(res, invalidRequest(errors));
  }

  const [loginOutcome, login] = await tryLogin({
    authMethod: 'password',
    clientId: req.body.clientId,
    email: req.body.email,
    password: req.body.password,
    scope: req.body.scope,
    role: req.body.role,
    nonce: randomUUID(),
    remember: true
  });
  assertOk(loginOutcome);

  const loginDetails = await finalizeLogin(login as Login);
  return res.status(200).json({
    ...loginDetails.tokens,
    project: loginDetails.project && getReferenceString(loginDetails.project),
    profile: loginDetails.profile && getReferenceString(loginDetails.profile)
  });
}
