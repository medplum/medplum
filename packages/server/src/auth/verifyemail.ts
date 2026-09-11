// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { allOk, badRequest, createReference, redirectOk, resolveId } from '@medplum/core';
import type { User, UserSecurityRequest } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { body } from 'express-validator';
import { sendOutcome } from '../fhir/outcomes';
import type { SystemRepository } from '../fhir/repo';
import { getGlobalSystemRepo } from '../fhir/repo';
import { generateSecret } from '../oauth/keys';
import { timingSafeEqualStr } from '../oauth/utils';
import { makeValidationMiddleware } from '../util/validator';
import {
  consumeSecurityRequest,
  getSecurityRequestExpiration,
  isSecurityRequestExpired,
  supersedePriorSecurityRequests,
} from './securityrequest';

export const verifyEmailValidator = makeValidationMiddleware([
  body('id').isUUID().withMessage('Invalid request ID'),
  body('secret').notEmpty().withMessage('Missing secret'),
]);

export async function verifyEmailHandler(req: Request, res: Response): Promise<void> {
  const systemRepo = getGlobalSystemRepo();
  const securityRequest = await systemRepo.readResource<UserSecurityRequest>('UserSecurityRequest', req.body.id);

  if (securityRequest.type !== 'verify-email') {
    sendOutcome(res, badRequest('Invalid user security request type'));
    return;
  }

  if (securityRequest.used) {
    sendOutcome(res, badRequest('Already used'));
    return;
  }

  if (isSecurityRequestExpired(securityRequest)) {
    sendOutcome(res, badRequest('Expired'));
    return;
  }

  if (!timingSafeEqualStr(securityRequest.secret, req.body.secret)) {
    sendOutcome(res, badRequest('Incorrect secret'));
    return;
  }

  const user = await systemRepo.readReference(securityRequest.user);

  await systemRepo.withTransaction(
    async (txRepo) => {
      // Consume the request first, so that concurrent requests carrying the same token
      // cannot both get through
      await consumeSecurityRequest(txRepo, securityRequest);
      await txRepo.updateResource<User>({ ...user, emailVerified: true });
    },
    { resourceTypes: ['User', 'UserSecurityRequest'], source: 'verifyEmailHandler' }
  );

  if (securityRequest.redirectUri) {
    // Send a "redirect", but don't actually follow it, because the client may want to handle the redirect themselves (e.g. in a React app).
    sendOutcome(res, redirectOk(new URL(securityRequest.redirectUri)));
  } else {
    sendOutcome(res, allOk);
  }
}

/**
 * Creates a "verify email" request for the user.
 * Returns the created UserSecurityRequest, which contains the secret that should be sent in the verification email.
 * @param systemRepo - The system repository to use for creating the request.
 * @param user - The user to create the request for.
 * @param redirectUri - Optional URI for redirection to the client application.
 * @returns The created UserSecurityRequest.
 */
export async function verifyEmail(
  systemRepo: SystemRepository,
  user: WithId<User>,
  redirectUri?: string
): Promise<WithId<UserSecurityRequest>> {
  // Invalidate any prior verification requests, so that only the newest link works
  await supersedePriorSecurityRequests(systemRepo, user, 'verify-email');

  // Create the email verification request
  return systemRepo.createResource<UserSecurityRequest>({
    resourceType: 'UserSecurityRequest',
    meta: { project: resolveId(user.project) },
    type: 'verify-email',
    user: createReference(user),
    secret: generateSecret(16),
    expiresAt: getSecurityRequestExpiration('verify-email'),
    redirectUri,
  });
}
