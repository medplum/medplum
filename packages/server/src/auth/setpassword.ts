// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { allOk, badRequest, EMPTY, getReferenceString, OperationOutcomeError, Operator } from '@medplum/core';
import type { Login, User, UserSecurityRequest } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { body } from 'express-validator';
import { pwnedPassword } from 'hibp';
import { sendOutcome } from '../fhir/outcomes';
import type { SystemRepository } from '../fhir/repo';
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
  const systemRepo = getGlobalSystemRepo();

  const securityRequest = await systemRepo.readResource<UserSecurityRequest>('UserSecurityRequest', req.body.id);

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

  const user = await systemRepo.readReference(securityRequest.user);
  await setPassword(systemRepo, { ...user, emailVerified: true }, req.body.password);
  await systemRepo.updateResource<typeof securityRequest>({ ...securityRequest, used: true });

  sendOutcome(res, allOk);
}

export async function setPassword(systemRepo: SystemRepository, user: WithId<User>, password: string): Promise<void> {
  const numPwns = await pwnedPassword(password);
  if (numPwns > 0) {
    throw new OperationOutcomeError(badRequest('Password found in breach database'));
  }

  const passwordHash = await bcryptHashPassword(password);
  await systemRepo.updateResource<User>({ ...user, passwordHash });

  const activeSessions = await systemRepo.search<Login>({
    resourceType: 'Login',
    filters: [{ code: 'user', operator: Operator.EQUALS, value: getReferenceString(user) }],
  });
  for (const entry of activeSessions.entry ?? EMPTY) {
    const login = entry.resource as Login;
    await systemRepo.updateResource({ ...login, revoked: true });
  }
}
