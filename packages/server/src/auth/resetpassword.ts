import { allOk, badRequest, createReference, Operator } from '@medplum/core';
import { BundleEntry, PasswordChangeRequest, User } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { getConfig } from '../config';
import { sendEmail } from '../email/email';
import { invalidRequest, sendOutcome } from '../fhir/outcomes';
import { systemRepo } from '../fhir/repo';
import { generateSecret } from '../oauth/keys';
import { verifyRecaptcha } from './utils';

export const resetPasswordValidators = [
  body('email').isEmail().withMessage('Valid email address is required'),
  body('recaptchaToken').notEmpty().withMessage('Recaptcha token is required'),
];

export async function resetPasswordHandler(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    sendOutcome(res, invalidRequest(errors));
    return;
  }

  if (!(await verifyRecaptcha(getConfig().recaptchaSecretKey as string, req.body.recaptchaToken))) {
    sendOutcome(res, badRequest('Recaptcha failed'));
    return;
  }

  const existingBundle = await systemRepo.search<User>({
    resourceType: 'User',
    filters: [
      {
        code: 'email',
        operator: Operator.EXACT,
        value: req.body.email,
      },
    ],
  });

  if ((existingBundle.entry as BundleEntry[]).length === 0) {
    sendOutcome(res, badRequest('User not found', 'email'));
    return;
  }

  const user = existingBundle?.entry?.[0]?.resource as User;

  const url = await resetPassword(user);

  await sendEmail({
    to: user.email,
    subject: 'Medplum Password Reset',
    text: [
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
    ].join('\n'),
  });

  sendOutcome(res, allOk);
}

/**
 * Creates a "password change request" for the user.
 * Returns the URL to the password change request.
 * @param user The user to create the password change request for.
 * @return The URL to reset the password.
 */
export async function resetPassword(user: User): Promise<string> {
  // Create the password change request
  const pcr = await systemRepo.createResource<PasswordChangeRequest>({
    resourceType: 'PasswordChangeRequest',
    user: createReference(user),
    secret: generateSecret(16),
  });

  // Build the reset URL
  return `${getConfig().appBaseUrl}setpassword/${pcr.id}/${pcr.secret}`;
}
