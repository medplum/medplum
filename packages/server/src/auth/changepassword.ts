// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { allOk, badRequest, OperationOutcomeError } from '@medplum/core';
import type { User } from '@medplum/fhirtypes';
import bcrypt from 'bcrypt';
import type { Request, Response } from 'express';
import { getAuthenticatedContext } from '../context';
import { sendOutcome } from '../fhir/outcomes';
import type { SystemRepository } from '../fhir/repo';
import { makeValidationMiddleware, passwordField, stringField } from '../util/validator';
import { setPassword } from './setpassword';
import { readUserForAccountManagement } from './utils';

export const changePasswordValidator = makeValidationMiddleware([
  stringField('oldPassword', 'Missing oldPassword').notEmpty(),
  passwordField('newPassword'),
]);

export async function changePasswordHandler(req: Request, res: Response): Promise<void> {
  const ctx = getAuthenticatedContext();

  const user = await readUserForAccountManagement(ctx);

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

  await setPassword(systemRepo, request.user, request.newPassword, { ifMatch: request.user.meta?.versionId });
}
