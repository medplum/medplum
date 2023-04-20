import { allOk, badRequest } from '@medplum/core';
import { PasswordChangeRequest, Reference, User } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { pwnedPassword } from 'hibp';
import { invalidRequest, sendOutcome } from '../fhir/outcomes';
import { systemRepo } from '../fhir/repo';
import { timingSafeEqualStr } from '../oauth/utils';
import { bcryptHashPassword } from './utils';

export const setPasswordValidators = [
  body('id').isUUID().withMessage('Invalid request ID'),
  body('secret').notEmpty().withMessage('Missing secret'),
  body('password').isLength({ min: 8 }).withMessage('Invalid password, must be at least 8 characters'),
];

export async function setPasswordHandler(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    sendOutcome(res, invalidRequest(errors));
    return;
  }

  const pcr = await systemRepo.readResource<PasswordChangeRequest>('PasswordChangeRequest', req.body.id);

  if (pcr.used) {
    sendOutcome(res, badRequest('Already used'));
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

  await setPassword(user, req.body.password);
  await systemRepo.updateResource<PasswordChangeRequest>({ ...pcr, used: true });
  sendOutcome(res, allOk);
}

export async function setPassword(user: User, password: string): Promise<void> {
  const passwordHash = await bcryptHashPassword(password);
  await systemRepo.updateResource<User>({ ...user, passwordHash });
}
