import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { invalidRequest, sendOutcome } from '../fhir';
import { tryLogin } from '../oauth';
import { sendLoginResult } from './utils';

export const loginValidators = [
  body('email').isEmail().withMessage('Valid email address is required'),
  body('password').isLength({ min: 5 }).withMessage('Invalid password, must be at least 5 characters'),
];

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    sendOutcome(res, invalidRequest(errors));
    return;
  }

  const login = await tryLogin({
    authMethod: 'password',
    clientId: req.body.clientId || undefined,
    projectId: req.body.projectId || undefined,
    scope: req.body.scope || 'openid',
    nonce: req.body.nonce || randomUUID(),
    codeChallenge: req.body.codeChallenge,
    codeChallengeMethod: req.body.codeChallengeMethod,
    email: req.body.email,
    password: req.body.password,
    remember: req.body.remember,
    remoteAddress: req.ip,
    userAgent: req.get('User-Agent'),
  });
  await sendLoginResult(res, login);
}
