// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { allOk, badRequest, createReference, resolveId } from '@medplum/core';
import type { User, UserSecurityRequest } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { body } from 'express-validator';
import { sendOutcome } from '../fhir/outcomes';
import { getGlobalSystemRepo } from '../fhir/repo';
import { generateSecret } from '../oauth/keys';
import { timingSafeEqualStr } from '../oauth/utils';
import { makeValidationMiddleware } from '../util/validator';

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

  if (!timingSafeEqualStr(securityRequest.secret, req.body.secret)) {
    sendOutcome(res, badRequest('Incorrect secret'));
    return;
  }

  const user = await systemRepo.readReference(securityRequest.user);

  await systemRepo.withTransaction(async () => {
    await systemRepo.updateResource<User>({ ...user, emailVerified: true });
    await systemRepo.updateResource<UserSecurityRequest>({ ...securityRequest, used: true });
  });

  sendOutcome(res, allOk);
}

/**
 * Creates a "verify email" for the user.
 * Returns the URL to the email verification request.
 * @param user - The user to create the request for.
 * @param redirectUri - Optional URI for redirection to the client application.
 * @returns The URL to reset the password.
 */
export async function verifyEmail(user: User, redirectUri?: string): Promise<WithId<UserSecurityRequest>> {
  // Create the password change request
  const systemRepo = getGlobalSystemRepo();
  return systemRepo.createResource<UserSecurityRequest>({
    resourceType: 'UserSecurityRequest',
    meta: { project: resolveId(user.project) },
    type: 'verify-email',
    user: createReference(user),
    secret: generateSecret(16),
    redirectUri,
  });
}
