// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, notFound } from '@medplum/core';
import type { Login } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { body } from 'express-validator';
import { getAuthenticatedContext } from '../context';
import { sendOutcome } from '../fhir/outcomes';
import { getGlobalSystemRepo } from '../fhir/repo';
import { revokeLogin } from '../oauth/utils';
import { makeValidationMiddleware } from '../util/validator';

export const revokeValidator = makeValidationMiddleware([
  body('loginId').isUUID().withMessage('Login ID is required.'),
]);

export async function revokeHandler(req: Request, res: Response): Promise<void> {
  const ctx = getAuthenticatedContext();

  const globalSystemRepo = getGlobalSystemRepo();
  const login = await globalSystemRepo.readResource<Login>('Login', req.body.loginId);

  // Make sure the login belongs to the current user
  if (login.user?.reference !== ctx.membership.user?.reference) {
    sendOutcome(res, notFound);
    return;
  }

  // Mark the login as revoked
  await revokeLogin(globalSystemRepo, login);

  sendOutcome(res, allOk);
}
