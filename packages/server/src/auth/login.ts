// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ResourceType } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { body } from 'express-validator';
import { randomUUID } from 'node:crypto';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../constants';
import { getLogger } from '../logger';
import { tryLogin } from '../oauth/utils';
import { makeValidationMiddleware } from '../util/validator';
import { getProjectIdByClientId, sendLoginResult } from './utils';

export const loginValidator = makeValidationMiddleware([
  body('email').isEmail().withMessage('Valid email address is required'),
  body('password')
    .isLength({ min: MIN_PASSWORD_LENGTH })
    .withMessage(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    .isByteLength({ max: MAX_PASSWORD_LENGTH })
    .withMessage(`Password must be no more than ${MAX_PASSWORD_LENGTH} characters`),
]);

export async function loginHandler(req: Request, res: Response): Promise<void> {
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

  try {
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
      allowNoMembership: req.body.projectId === 'new',
      origin: req.get('Origin'),
    });
    getLogger().info('Login success', { email: req.body.email, projectId });
    await sendLoginResult(res, login);
  } catch (err) {
    getLogger().warn('Login failed', { email: req.body.email, projectId });
    throw err;
  }
}
