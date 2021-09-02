import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { allOk, assertOk, badRequest, Bundle, BundleEntry, createReference, Operator, PasswordChangeRequest, User } from '@medplum/core';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { getConfig } from '../config';
import { invalidRequest, repo, sendOutcome } from '../fhir';
import { generateSecret } from '../oauth';

export const resetPasswordValidators = [
  body('email').isEmail().withMessage('Valid email address is required')
];

export async function resetPasswordHandler(req: Request, res: Response) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendOutcome(res, invalidRequest(errors));
  }

  const [existingOutcome, existingBundle] = await repo.search<User>({
    resourceType: 'User',
    filters: [{
      code: 'email',
      operator: Operator.EQUALS,
      value: req.body.email
    }]
  });
  assertOk(existingOutcome);

  if (((existingBundle as Bundle).entry as BundleEntry[]).length === 0) {
    return sendOutcome(res, badRequest('User not found', 'email'));
  }

  await resetPassword(existingBundle?.entry?.[0]?.resource as User);
  return sendOutcome(res, allOk);
}

export async function resetPassword(user: User) {
  // Create the password change request
  const [createOutcome, pcr] = await repo.createResource<PasswordChangeRequest>({
    resourceType: 'PasswordChangeRequest',
    user: createReference(user),
    secret: generateSecret(16)
  });
  assertOk(createOutcome);

  // Build the reset URL
  const url = `${getConfig().appBaseUrl}setpassword/${pcr?.id}/${pcr?.secret}`;

  // Send the email
  const sesClient = new SESv2Client({ region: 'us-east-1' });
  await sesClient.send(new SendEmailCommand({
    FromEmailAddress: getConfig().supportEmail,
    Destination: {
      ToAddresses: [user.email as string]
    },
    Content: {
      Simple: {
        Subject: {
          Data: 'Medplum Password Reset'
        },
        Body: {
          Text: {
            Data: [
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
              ''
            ].join('\n')
          }
        },
      }
    }
  }));
}
