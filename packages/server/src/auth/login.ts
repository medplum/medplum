// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { sleep } from '@medplum/core';
import type { ResourceType } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { body } from 'express-validator';
import { randomUUID } from 'node:crypto';
import { getConfig } from '../config/loader';
import { getLogger } from '../logger';
import { tryLogin } from '../oauth/utils';
import { peekRateLimitState } from '../ratelimit';
import { makeValidationMiddleware } from '../util/validator';
import { getProjectIdByClientId, sendLoginResult } from './utils';

export const loginValidator = makeValidationMiddleware([
  body('email').isEmail().withMessage('Valid email address is required'),
  body('password').isLength({ min: 8 }).withMessage('Invalid password, must be at least 8 characters'),
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
    const config = getConfig();
    const rateLimitState = await peekRateLimitState(req, config);
    const attempts = rateLimitState?.consumedPoints ?? 0;
    const startAttempt = config.failedLoginThrottleStartAttempt;
    const baseDelayMs = config.failedLoginThrottleBaseDelayMs;
    const maxDelayMs = config.failedLoginThrottleMaxDelayMs;
    const exponent = Math.max(attempts - startAttempt, 0);
    const rawDelayMs = baseDelayMs * 2 ** exponent;
    const delayMs = Math.min(maxDelayMs, rawDelayMs);
    getLogger().warn('Login failed', { email: req.body.email, projectId, attempts, delayMs });
    await sleep(delayMs);
    throw err;
  }
}
