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
  let pcr: UserSecurityRequest | PasswordChangeRequest;
  try {
    pcr = await systemRepo.readResource<PasswordChangeRequest>('PasswordChangeRequest', req.body.id);
  } catch (err) {
    pcr = await systemRepo.readResource<UserSecurityRequest>('UserSecurityRequest', req.body.id);
  }

  if (pcr.used) {
    sendOutcome(res, badRequest('Already used'));
    return;
  }

  if (pcr.type === 'verify-email') {
    sendOutcome(res, badRequest('Invalid request type'));
    return;
  }

  if (!timingSafeEqualStr(pcr.secret as string, req.body.secret)) {
    sendOutcome(res, badRequest('Incorrect secret'));
    return;
  }

  const user = await systemRepo.readReference(pcr.user as Reference<User>);

  const numPwns = await pwnedPassword(req.body.password);
  if (numPwns > 0) {
    sendOutcome(res, badRequest('Password found in breach database', 'password'));
    return;
  }

  await setPassword({ ...user, emailVerified: true }, req.body.password);
  await systemRepo.updateResource<typeof pcr>({ ...pcr, used: true });
  sendOutcome(res, allOk);
}

export async function setPassword(user: User, password: string): Promise<void> {
  const passwordHash = await bcryptHashPassword(password);
  const systemRepo = getSystemRepo();
  await systemRepo.updateResource<User>({ ...user, passwordHash });
}
