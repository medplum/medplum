// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { badRequest, OperationOutcomeError } from '@medplum/core';
import type { Login, ProjectMembership } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { body } from 'express-validator';
import { getGlobalSystemRepo } from '../fhir/repo';
import { setLoginMembership } from '../oauth/utils';
import { makeValidationMiddleware } from '../util/validator';
import { sendLoginCookie } from './utils';

/*
 * The profile handler is used during login when a user has multiple profiles.
 * The client will submit the profile id and the server will update the login.
 */

export const profileValidator = makeValidationMiddleware([
  body('login').exists().withMessage('Missing login'),
  body('profile').exists().withMessage('Missing profile'),
]);

export async function profileHandler(req: Request, res: Response): Promise<void> {
  const globalSystemRepo = getGlobalSystemRepo();
  const login = await globalSystemRepo.readResource<Login>('Login', req.body.login);

  // Find the membership for the user
  let membership: WithId<ProjectMembership>;
  try {
    membership = await globalSystemRepo.readResource<ProjectMembership>('ProjectMembership', req.body.profile);
  } catch {
    throw new OperationOutcomeError(badRequest('Profile not found'));
  }

  // Update the login
  const updated = await setLoginMembership(login, membership);

  // Send login cookie
  sendLoginCookie(res, login);

  // Send code
  res.status(200).json({
    login: updated.id,
    code: updated.code,
  });
}
