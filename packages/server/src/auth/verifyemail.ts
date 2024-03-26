import { allOk, badRequest, createReference, resolveId } from '@medplum/core';
import { PasswordChangeRequest, Reference, User } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { body } from 'express-validator';
import { sendOutcome } from '../fhir/outcomes';
import { getSystemRepo } from '../fhir/repo';
import { timingSafeEqualStr } from '../oauth/utils';
import { makeValidationMiddleware } from '../util/validator';
import { generateSecret } from '../oauth/keys';
import { getConfig } from '../config';

export const verifyEmailValidator = makeValidationMiddleware([
  body('id').isUUID().withMessage('Invalid request ID'),
  body('secret').notEmpty().withMessage('Missing secret'),
]);

export async function verifyEmailHandler(req: Request, res: Response): Promise<void> {
  const systemRepo = getSystemRepo();
  const pcr = await systemRepo.readResource<PasswordChangeRequest>('PasswordChangeRequest', req.body.id);

  if (pcr.type !== 'verify-email') {
    sendOutcome(res, badRequest('Invalid request type'));
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
    await systemRepo.updateResource<PasswordChangeRequest>({ ...pcr, used: true });
  });

  sendOutcome(res, allOk);
}

/**
 * Creates a "verify email request" for the user.
 * Returns the URL to the verify email request.
 * @param user - The user to create the verify email request for.
 * @param redirectUri - Optional URI for redirection to the client application.
 * @returns The URL to verify the email.
 */
export async function createVerifyEmailRequest(user: User, redirectUri?: string): Promise<string> {
  // Create the verify email request
  const systemRepo = getSystemRepo();
  const pcr = await systemRepo.createResource<PasswordChangeRequest>({
    resourceType: 'PasswordChangeRequest',
    meta: {
      project: resolveId(user.project),
    },
    type: 'verify-email',
    user: createReference(user),
    secret: generateSecret(16),
    redirectUri,
  });

  // Build the reset URL
  return `${getConfig().appBaseUrl}verifyemail/${pcr.id}/${pcr.secret}`;
}
