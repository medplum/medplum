// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { allOk, badRequest, EMPTY, getReferenceString, OperationOutcomeError, Operator } from '@medplum/core';
import type { Login, User, UserSecurityRequest } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { body } from 'express-validator';
import { pwnedPassword } from 'hibp';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../constants';
import { sendOutcome } from '../fhir/outcomes';
import type { SuperAdminRepository } from '../fhir/repo';
import { getGlobalSystemRepo } from '../fhir/repo';
import { timingSafeEqualStr } from '../oauth/utils';
import { makeValidationMiddleware } from '../util/validator';
import { consumeSecurityRequest, isSecurityRequestExpired } from './securityrequest';
import { bcryptHashPassword } from './utils';

export const setPasswordValidator = makeValidationMiddleware([
  body('id').isUUID().withMessage('Invalid request ID'),
  body('secret').notEmpty().withMessage('Missing secret'),
  body('password')
    .isLength({ min: MIN_PASSWORD_LENGTH })
    .withMessage(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    .isByteLength({ max: MAX_PASSWORD_LENGTH })
    .withMessage(`Password must be no more than ${MAX_PASSWORD_LENGTH} characters`),
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

  if (isSecurityRequestExpired(securityRequest)) {
    sendOutcome(res, badRequest('Expired'));
    return;
  }

  if (!timingSafeEqualStr(securityRequest.secret, req.body.secret)) {
    sendOutcome(res, badRequest('Incorrect secret'));
    return;
  }

  const user = await systemRepo.readReference(securityRequest.user);
  await setPassword(systemRepo, { ...user, emailVerified: true }, req.body.password, securityRequest);

  sendOutcome(res, allOk);
}

/**
 * Sets the user's password and revokes their active sessions.
 *
 * When the change is authorized by a UserSecurityRequest, pass it as `securityRequest` so that it
 * is consumed in the same transaction that applies the password: either both land or neither does.
 * It is consumed after the password has been validated and hashed, so a password that fails
 * validation does not burn the user's link, but before the password is applied, so the request
 * cannot be redeemed twice.
 * @param repo - The system repository to use.
 * @param user - The user whose password is being set.
 * @param password - The new plaintext password.
 * @param securityRequest - Optional security request authorizing the change, consumed on success.
 */
export async function setPassword(
  repo: SuperAdminRepository,
  user: WithId<User>,
  password: string,
  securityRequest?: WithId<UserSecurityRequest>
): Promise<void> {
  const numPwns = await pwnedPassword(password);
  if (numPwns > 0) {
    throw new OperationOutcomeError(badRequest('Password found in breach database'));
  }

  const passwordHash = await bcryptHashPassword(password);

  await repo.withTransaction(
    async (txRepo) => {
      // Consume the request first, so that concurrent requests carrying the same token
      // cannot both get through
      if (securityRequest) {
        await consumeSecurityRequest(txRepo.getSystemRepo(), securityRequest);
      }
      await txRepo.updateResource<User>({ ...user, passwordHash });
    },
    { resourceTypes: ['User', 'UserSecurityRequest'], source: 'setPassword' }
  );

  const activeSessions = await repo.search<Login>({
    resourceType: 'Login',
    filters: [{ code: 'user', operator: Operator.EQUALS, value: getReferenceString(user) }],
  });
  for (const entry of activeSessions.entry ?? EMPTY) {
    const login = entry.resource as Login;
    await repo.updateResource({ ...login, revoked: true });
  }
}
