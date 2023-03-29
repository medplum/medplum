import { ResourceType } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { invalidRequest, sendOutcome } from '../fhir/outcomes';
import { tryLogin } from '../oauth/utils';
import { sendLoginResult, getProjectIdByClientId } from './utils';

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

  // Resource type can optionally be specified.
  // If specified, only memberships of that type will be returned.
  // If not specified, all memberships will be considered.
  const resourceType = req.body.resourceType as ResourceType | undefined;

  // Project ID can come from one of two sources
  // 1) Passed in explicitly as projectId
  // 2) Implicit with clientId
  // The only rule is that they have to match
  const clientId = req.body.clientId;
  const projectId = await getProjectIdByClientId(req.body.clientId, req.body.projectId as string | undefined);

  const login = await tryLogin({
    authMethod: 'password',
    clientId,
    projectId,
    resourceType,
    scope: req.body.scope || 'openid',
    nonce: req.body.nonce || randomUUID(),
    launchId: req.body.launch,
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
