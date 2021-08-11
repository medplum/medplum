import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { Bundle, BundleEntry, Operator, User } from '@medplum/core';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { getConfig } from '../config';
import { allOk, assertOk, badRequest, invalidRequest, repo, sendOutcome } from '../fhir';

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

  const sesClient = new SESv2Client({ region: 'us-east-1' });
  await sesClient.send(new SendEmailCommand({
    FromEmailAddress: getConfig().supportEmail,
    Destination: {
      ToAddresses: [req.body.email]
    },
    Content: {
      Simple: {
        Subject: {
          Data: 'Medplum Password Reset'
        },
        Body: {
          Text: {
            Data: 'Click here to reset your password'
          }
        },
      }
    }
  }));

  return sendOutcome(res, allOk);
}
