import { allOk, badRequest, createReference, Operator, resolveId } from '@medplum/core';
import { PasswordChangeRequest, Project, User } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { getConfig } from '../config';
import { sendEmail } from '../email/email';
import { invalidRequest, sendOutcome } from '../fhir/outcomes';
import { systemRepo } from '../fhir/repo';
import { generateSecret } from '../oauth/keys';
import { getProjectByRecaptchaSiteKey, verifyRecaptcha } from './utils';

export const resetPasswordValidators = [body('email').isEmail().withMessage('Valid email address is required')];

export async function resetPasswordHandler(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    sendOutcome(res, invalidRequest(errors));
    return;
  }

  const recaptchaSiteKey = req.body.recaptchaSiteKey;
  let secretKey: string | undefined = getConfig().recaptchaSecretKey;
  let project: Project | undefined;

  if (recaptchaSiteKey && recaptchaSiteKey !== getConfig().recaptchaSiteKey) {
    // If the recaptcha site key is not the main Medplum recaptcha site key,
    // then it must be associated with a Project.
    // The user can only authenticate with that project.
    project = await getProjectByRecaptchaSiteKey(recaptchaSiteKey, req.body.projectId as string | undefined);
    if (!project) {
      sendOutcome(res, badRequest('Invalid recaptchaSiteKey'));
      return;
    }
    secretKey = project.site?.find((s) => s.recaptchaSiteKey === recaptchaSiteKey)?.recaptchaSecretKey;
    if (!secretKey) {
      sendOutcome(res, badRequest('Invalid recaptchaSecretKey'));
      return;
    }
  }

  if (secretKey) {
    if (!req.body.recaptchaToken) {
      sendOutcome(res, badRequest('Recaptcha token is required'));
      return;
    }

    if (!(await verifyRecaptcha(secretKey, req.body.recaptchaToken))) {
      sendOutcome(res, badRequest('Recaptcha failed'));
      return;
    }
  }

  const user = await systemRepo.searchOne<User>({
    resourceType: 'User',
    filters: [
      {
        code: 'email',
        operator: Operator.EXACT,
        value: req.body.email,
      },
    ],
  });

  if (!user) {
    // Per OWASP guidelines, send "ok" to prevent account enumeration attack
    // See: https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/03-Identity_Management_Testing/04-Testing_for_Account_Enumeration_and_Guessable_User_Account
    sendOutcome(res, allOk);
    return;
  }

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
 * @returns The URL to reset the password.
 */
export async function resetPassword(user: User): Promise<string> {
  // Create the password change request
  const pcr = await systemRepo.createResource<PasswordChangeRequest>({
    resourceType: 'PasswordChangeRequest',
    meta: {
      project: resolveId(user.project),
    },
    user: createReference(user),
    secret: generateSecret(16),
  });

  // Build the reset URL
  return `${getConfig().appBaseUrl}setpassword/${pcr.id}/${pcr.secret}`;
}
