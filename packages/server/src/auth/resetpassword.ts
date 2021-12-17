import { allOk, assertOk, badRequest, createReference, Operator } from '@medplum/core';
import { Bundle, BundleEntry, PasswordChangeRequest, User } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { getConfig } from '../config';
import { sendEmail } from '../email';
import { invalidRequest, repo, sendOutcome } from '../fhir';
import { generateSecret } from '../oauth';

export const resetPasswordValidators = [body('email').isEmail().withMessage('Valid email address is required')];

export async function resetPasswordHandler(req: Request, res: Response) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendOutcome(res, invalidRequest(errors));
  }

  const [existingOutcome, existingBundle] = await repo.search<User>({
    resourceType: 'User',
    filters: [
      {
        code: 'email',
        operator: Operator.EQUALS,
        value: req.body.email,
      },
    ],
  });
  assertOk(existingOutcome);

  if (((existingBundle as Bundle).entry as BundleEntry[]).length === 0) {
    return sendOutcome(res, badRequest('User not found', 'email'));
  }

  const user = existingBundle?.entry?.[0]?.resource as User;

  const url = await resetPassword(user);

  await sendEmail(
    [user.email as string],
    'Medplum Password Reset',
    [
      'Someone requested to reset your Medplum password.',
      '',
      'Please click on the following link:',
      '',
      url,
      '',
      'If you received this in error, you can safely ignore it.',
      '',
      'Thank you,',
      'Medplum',
      '',
    ].join('\n')
  );

  return sendOutcome(res, allOk);
}

/**
 * Creates a "password change request" for the user.
 * Returns the URL to the password change request.
 * @param user The user to create the password change request for.
 * @return The URL to reset the password.
 */
export async function resetPassword(user: User): Promise<string> {
  // Create the password change request
  const [createOutcome, pcr] = await repo.createResource<PasswordChangeRequest>({
    resourceType: 'PasswordChangeRequest',
    user: createReference(user),
    secret: generateSecret(16),
  });
  assertOk(createOutcome);

  // Build the reset URL
  return `${getConfig().appBaseUrl}setpassword/${pcr?.id}/${pcr?.secret}`;
}
