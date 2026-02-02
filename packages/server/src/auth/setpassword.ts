// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest } from '@medplum/core';
import type { User, UserSecurityRequest } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { body } from 'express-validator';
import { pwnedPassword } from 'hibp';
import { sendOutcome } from '../fhir/outcomes';
import { getGlobalSystemRepo } from '../fhir/repo';
import { timingSafeEqualStr } from '../oauth/utils';
import { makeValidationMiddleware } from '../util/validator';
import { bcryptHashPassword } from './utils';

export const setPasswordValidator = makeValidationMiddleware([
  body('id').isUUID().withMessage('Invalid request ID'),
  body('secret').notEmpty().withMessage('Missing secret'),
  body('password').isLength({ min: 8 }).withMessage('Invalid password, must be at least 8 characters'),
]);

export async function setPasswordHandler(req: Request, res: Response): Promise<void> {
  const globalSystemRepo = getGlobalSystemRepo();

  const securityRequest = await globalSystemRepo.readResource<UserSecurityRequest>('UserSecurityRequest', req.body.id);

  if (securityRequest.used) {
    sendOutcome(res, badRequest('Already used'));
    return;
  }

  if (securityRequest.type === 'verify-email') {
    sendOutcome(res, badRequest('Invalid request type'));
    return;
  }

  if (!timingSafeEqualStr(securityRequest.secret, req.body.secret)) {
    sendOutcome(res, badRequest('Incorrect secret'));
    return;
  }

  const user = await globalSystemRepo.readReference(securityRequest.user);

  const numPwns = await pwnedPassword(req.body.password);
  if (numPwns > 0) {
    sendOutcome(res, badRequest('Password found in breach database', 'password'));
    return;
  }

  await setPassword({ ...user, emailVerified: true }, req.body.password);
  await globalSystemRepo.updateResource<typeof securityRequest>({ ...securityRequest, used: true });
  sendOutcome(res, allOk);
}

export async function setPassword(user: User, password: string): Promise<void> {
  const passwordHash = await bcryptHashPassword(password);
  const systemRepo = getGlobalSystemRepo();
  await systemRepo.updateResource<User>({ ...user, passwordHash });
}
