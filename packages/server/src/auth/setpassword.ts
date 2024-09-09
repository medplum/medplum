import { allOk, badRequest } from '@medplum/core';
import { PasswordChangeRequest, Reference, User, UserSecurityRequest } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { body } from 'express-validator';
import { pwnedPassword } from 'hibp';
import { sendOutcome } from '../fhir/outcomes';
import { getSystemRepo } from '../fhir/repo';
import { timingSafeEqualStr } from '../oauth/utils';
import { makeValidationMiddleware } from '../util/validator';
import { bcryptHashPassword } from './utils';

export const setPasswordValidator = makeValidationMiddleware([
  body('id').isUUID().withMessage('Invalid request ID'),
  body('secret').notEmpty().withMessage('Missing secret'),
  body('password').isLength({ min: 8 }).withMessage('Invalid password, must be at least 8 characters'),
]);

export async function setPasswordHandler(req: Request, res: Response): Promise<void> {
  const systemRepo = getSystemRepo();
  let securityRequest: UserSecurityRequest | PasswordChangeRequest;

  // PasswordChangeRequest is deprecated but still supported. When it is removed, this try/catch can be removed
  try {
    securityRequest = await systemRepo.readResource<UserSecurityRequest>('UserSecurityRequest', req.body.id);
  } catch (_err) {
    securityRequest = await systemRepo.readResource<PasswordChangeRequest>('PasswordChangeRequest', req.body.id);
  }

  if (securityRequest.used) {
    sendOutcome(res, badRequest('Already used'));
    return;
  }

  if (securityRequest.type === 'verify-email') {
    sendOutcome(res, badRequest('Invalid request type'));
    return;
  }

  if (!timingSafeEqualStr(securityRequest.secret as string, req.body.secret)) {
    sendOutcome(res, badRequest('Incorrect secret'));
    return;
  }

  const user = await systemRepo.readReference(securityRequest.user as Reference<User>);

  const numPwns = await pwnedPassword(req.body.password);
  if (numPwns > 0) {
    sendOutcome(res, badRequest('Password found in breach database', 'password'));
    return;
  }

  await setPassword({ ...user, emailVerified: true }, req.body.password);
  await systemRepo.updateResource<typeof securityRequest>({ ...securityRequest, used: true });
  sendOutcome(res, allOk);
}

export async function setPassword(user: User, password: string): Promise<void> {
  const passwordHash = await bcryptHashPassword(password);
  const systemRepo = getSystemRepo();
  await systemRepo.updateResource<User>({ ...user, passwordHash });
}
