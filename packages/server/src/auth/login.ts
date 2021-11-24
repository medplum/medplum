import { assertOk, Reference, User } from '@medplum/core';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { invalidRequest, repo, sendOutcome } from '../fhir';
import { rewriteAttachments, RewriteMode } from '../fhir/rewrite';
import { getUserProfiles, tryLogin } from '../oauth';

export const loginValidators = [
  body('clientId').notEmpty().withMessage('Missing clientId'),
  body('email').isEmail().withMessage('Valid email address is required'),
  body('password').isLength({ min: 5 }).withMessage('Invalid password, must be at least 5 characters'),
];

export async function loginHandler(req: Request, res: Response) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendOutcome(res, invalidRequest(errors));
  }

  const [loginOutcome, login] = await tryLogin({
    authMethod: 'password',
    clientId: req.body.clientId,
    scope: req.body.scope,
    codeChallenge: req.body.codeChallenge,
    codeChallengeMethod: req.body.codeChallengeMethod,
    email: req.body.email,
    password: req.body.password,
    nonce: randomUUID(),
    remember: true
  });
  assertOk(loginOutcome);

  const profiles = await getUserProfiles(login?.user as Reference<User>);

  // Safe to rewrite attachments,
  // because we know that these are all resources that the user has access to
  return res.status(200).json(await rewriteAttachments(RewriteMode.PRESIGNED_URL, repo, {
    login: login?.id,
    profiles
  }));
}
