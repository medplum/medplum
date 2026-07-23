// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { allOk, badRequest, OperationOutcomeError } from '@medplum/core';
import type { Reference, User } from '@medplum/fhirtypes';
import bcrypt from 'bcrypt';
import type { Request, Response } from 'express';
import { body } from 'express-validator';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../constants';
import { getAuthenticatedContext } from '../context';
import { sendOutcome } from '../fhir/outcomes';
import type { SystemRepository } from '../fhir/repo';
import { makeValidationMiddleware } from '../util/validator';
import { setPassword } from './setpassword';

export const changePasswordValidator = makeValidationMiddleware([
  body('oldPassword').notEmpty().withMessage('Missing oldPassword'),
  body('newPassword')
    .isLength({ min: MIN_PASSWORD_LENGTH })
    .withMessage(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    .isByteLength({ max: MAX_PASSWORD_LENGTH })
    .withMessage(`Password must be no more than ${MAX_PASSWORD_LENGTH} characters`),
]);

export async function changePasswordHandler(req: Request, res: Response): Promise<void> {
  const ctx = getAuthenticatedContext();

  const user = await ctx.systemRepo.readReference<User>(ctx.membership.user as Reference<User>);

  await changePassword(ctx.systemRepo, {
    user,
    oldPassword: req.body.oldPassword,
    newPassword: req.body.newPassword,
  });

  sendOutcome(res, allOk);
}

export interface ChangePasswordRequest {
  user: WithId<User>;
  oldPassword: string;
  newPassword: string;
}

async function changePassword(systemRepo: SystemRepository, request: ChangePasswordRequest): Promise<void> {
  const oldPasswordHash = request.user.passwordHash;
  if (!oldPasswordHash) {
    throw new OperationOutcomeError(badRequest('Existing password not set', 'oldPassword'));
  }

  const bcryptResult = await bcrypt.compare(request.oldPassword, oldPasswordHash);
  if (!bcryptResult) {
    throw new OperationOutcomeError(badRequest('Incorrect password', 'oldPassword'));
  }

  await setPassword(systemRepo, request.user, request.newPassword);
}
