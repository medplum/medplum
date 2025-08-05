// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, createReference, resolveId, WithId } from '@medplum/core';
import { Reference, User, UserSecurityRequest } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { body } from 'express-validator';
import { sendOutcome } from '../fhir/outcomes';
import { getSystemRepo } from '../fhir/repo';
import { generateSecret } from '../oauth/keys';
import { timingSafeEqualStr } from '../oauth/utils';
import { makeValidationMiddleware } from '../util/validator';

export const verifyEmailValidator = makeValidationMiddleware([
  body('id').isUUID().withMessage('Invalid request ID'),
  body('secret').notEmpty().withMessage('Missing secret'),
]);

export async function verifyEmailHandler(req: Request, res: Response): Promise<void> {
  const systemRepo = getSystemRepo();
  const pcr = await systemRepo.readResource<UserSecurityRequest>('UserSecurityRequest', req.body.id);

  if (pcr.type !== 'verify-email') {
    sendOutcome(res, badRequest('Invalid user security request type'));
    return;
  }

  if (pcr.used) {
    sendOutcome(res, badRequest('Already used'));
    return;
  }

  if (!timingSafeEqualStr(pcr.secret as string, req.body.secret)) {
    sendOutcome(res, badRequest('Incorrect secret'));
    return;
  }

  const user = await systemRepo.readReference(pcr.user as Reference<User>);

  await systemRepo.withTransaction(async () => {
    await systemRepo.updateResource<User>({ ...user, emailVerified: true });
    await systemRepo.updateResource<UserSecurityRequest>({ ...pcr, used: true });
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
  const systemRepo = getSystemRepo();
  return systemRepo.createResource<UserSecurityRequest>({
    resourceType: 'UserSecurityRequest',
    meta: { project: resolveId(user.project) },
    type: 'verify-email',
    user: createReference(user),
    secret: generateSecret(16),
    redirectUri,
  });
}
