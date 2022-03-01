import { allOk, assertOk, badRequest } from '@medplum/core';
import { PasswordChangeRequest, Reference, User } from '@medplum/fhirtypes';
import bcrypt from 'bcryptjs';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { pwnedPassword } from 'hibp';
import { invalidRequest, sendOutcome, systemRepo } from '../fhir';

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

  const [pcrOutcome, pcr] = await systemRepo.readResource<PasswordChangeRequest>('PasswordChangeRequest', req.body.id);
  assertOk(pcrOutcome, pcr);

  if (pcr.used) {
    sendOutcome(res, badRequest('Already used'));
    return;
  }

  if (pcr.secret !== req.body.secret) {
    sendOutcome(res, badRequest('Incorrect secret'));
    return;
  }

  const [userOutcome, user] = await systemRepo.readReference(pcr.user as Reference<User>);
  assertOk(userOutcome, user);

  const numPwns = await pwnedPassword(req.body.password);
  if (numPwns > 0) {
    sendOutcome(res, badRequest('Password found in breach database', 'password'));
    return;
  }

  const passwordHash = await bcrypt.hash(req.body.password, 10);
  const [updateUserOutcome, updatedUser] = await systemRepo.updateResource<User>({
    ...user,
    passwordHash,
  });
  assertOk(updateUserOutcome, updatedUser);

  const [updatePcrOutcome, updatedPcr] = await systemRepo.updateResource<PasswordChangeRequest>({
    ...pcr,
    used: true,
  });
  assertOk(updatePcrOutcome, updatedPcr);

  sendOutcome(res, allOk);
}
