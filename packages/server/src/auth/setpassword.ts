import { allOk, assertOk, badRequest } from '@medplum/core';
import { PasswordChangeRequest, Reference, User } from '@medplum/fhirtypes';
import bcrypt from 'bcrypt';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { invalidRequest, repo, sendOutcome } from '../fhir';

export const setPasswordValidators = [
  body('id').isUUID().withMessage('Invalid request ID'),
  body('secret').notEmpty().withMessage('Missing secret'),
  body('password').isLength({ min: 5 }).withMessage('Invalid password, must be at least 5 characters'),
];

export async function setPasswordHandler(req: Request, res: Response) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendOutcome(res, invalidRequest(errors));
  }

  const [pcrOutcome, pcr] = await repo.readResource<PasswordChangeRequest>('PasswordChangeRequest', req.body.id);
  assertOk(pcrOutcome);

  if (pcr?.used) {
    return sendOutcome(res, badRequest('Already used'));
  }

  if (pcr?.secret !== req.body.secret) {
    return sendOutcome(res, badRequest('Incorrect secret'));
  }

  const [userOutcome, user] = await repo.readReference(pcr?.user as Reference<User>);
  assertOk(userOutcome);

  const passwordHash = await bcrypt.hash(req.body.password, 10);
  const [updateUserOutcome] = await repo.updateResource<User>({
    ...user as User,
    passwordHash
  });
  assertOk(updateUserOutcome);

  const [updatePcrOutcome] = await repo.updateResource<PasswordChangeRequest>({
    ...pcr as PasswordChangeRequest,
    used: true
  });
  assertOk(updatePcrOutcome);

  return sendOutcome(res, allOk);
}
