import { allOk, badRequest, OperationOutcomeError } from '@medplum/core';
import { Reference, User } from '@medplum/fhirtypes';
import bcrypt from 'bcryptjs';
import { Request, Response } from 'express';
import { body } from 'express-validator';
import { pwnedPassword } from 'hibp';
import { sendOutcome } from '../fhir/outcomes';
import { systemRepo } from '../fhir/repo';
import { bcryptHashPassword } from './utils';
import { getAuthenticatedContext } from '../context';
import { makeValidationMiddleware } from '../util/validator';

export const changePasswordValidator = makeValidationMiddleware([
  body('oldPassword').notEmpty().withMessage('Missing oldPassword'),
  body('newPassword').isLength({ min: 8 }).withMessage('Invalid password, must be at least 8 characters'),
]);

export async function changePasswordHandler(req: Request, res: Response): Promise<void> {
  const ctx = getAuthenticatedContext();

  const user = await systemRepo.readReference<User>(ctx.membership.user as Reference<User>);

  await changePassword({
    user,
    oldPassword: req.body.oldPassword,
    newPassword: req.body.newPassword,
  });

  sendOutcome(res, allOk);
}

export interface ChangePasswordRequest {
  user: User;
  oldPassword: string;
  newPassword: string;
}

export async function changePassword(request: ChangePasswordRequest): Promise<void> {
  const oldPasswordHash = request.user.passwordHash as string;
  const bcryptResult = await bcrypt.compare(request.oldPassword, oldPasswordHash);
  if (!bcryptResult) {
    throw new OperationOutcomeError(badRequest('Incorrect password', 'oldPassword'));
  }

  const numPwns = await pwnedPassword(request.newPassword);
  if (numPwns > 0) {
    throw new OperationOutcomeError(badRequest('Password found in breach database', 'newPassword'));
  }

  const newPasswordHash = await bcryptHashPassword(request.newPassword);
  await systemRepo.updateResource<User>({
    ...request.user,
    passwordHash: newPasswordHash,
  });
}
