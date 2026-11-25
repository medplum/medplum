// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Operation, WithId } from '@medplum/core';
import {
  allOk,
  badRequest,
  DEFAULT_MAX_SEARCH_COUNT,
  getReferenceString,
  OperationOutcomeError,
  Operator,
  preconditionFailed,
} from '@medplum/core';
import type { Login, User, UserSecurityRequest } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { body } from 'express-validator';
import { pwnedPassword } from 'hibp';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../constants';
import { sendOutcome } from '../fhir/outcomes';
import type { SuperAdminRepository } from '../fhir/repo';
import { getGlobalSystemRepo } from '../fhir/repo';
import { minCursorBasedSearchPageSize } from '../fhir/search';
import { getLogger } from '../logger';
import { timingSafeEqualStr } from '../oauth/utils';
import { makeValidationMiddleware } from '../util/validator';
import { hasExternalAuth } from './method';
import { consumeSecurityRequest, isSecurityRequestExpired, retirePasswordSecurityRequests } from './securityrequest';
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
  if (user.email && (await hasExternalAuth(user.email))) {
    sendOutcome(res, badRequest('Cannot set password for external auth. Contact your system administrator.'));
    return;
  }

  await setPassword(systemRepo, user, req.body.password, { securityRequest });

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
 *
 * Sessions are revoked after the password is saved, outside that transaction. If revocation fails
 * partway, a retry or the next password change revokes the remaining sessions.
 * @param repo - The system repository to use.
 * @param user - The user whose password is being set.
 * @param password - The new plaintext password.
 * @param options - Optional settings.
 * @param options.securityRequest - Security request authorizing the change, consumed on success.
 * @param options.ifMatch - Version of the User that authorized the change, such as the one the current
 * password was verified against. The change is refused if the User has changed since.
 */
export async function setPassword(
  repo: SuperAdminRepository,
  user: WithId<User>,
  password: string,
  options: { securityRequest?: WithId<UserSecurityRequest>; ifMatch?: string } = {}
): Promise<void> {
  const { securityRequest, ifMatch } = options;
  const numPwns = await pwnedPassword(password);
  if (numPwns > 0) {
    throw new OperationOutcomeError(badRequest('Password found in breach database'));
  }

  const passwordHash = await bcryptHashPassword(password);

  const patch: Operation[] = [{ op: 'add', path: '/passwordHash', value: passwordHash }];
  if (securityRequest) {
    // Redeeming a request proves the user received the link that was sent to their address,
    // so the same write that applies the password also marks the email verified.
    patch.push({ op: 'add', path: '/emailVerified', value: true });
  }

  await repo.withTransaction(
    async (txRepo) => {
      // Consume the request first, so that concurrent requests carrying the same token
      // cannot both get through
      if (securityRequest) {
        await consumeSecurityRequest(txRepo.getSystemRepo(), securityRequest);
      }
      // Links issued before this change must not be able to replace the new password
      await retirePasswordSecurityRequests(txRepo.getSystemRepo(), user);
      // Patch so that only these fields are written, leaving the rest of the User as
      // stored rather than reverting it to this snapshot. The patch reads the User in the
      // transaction, so a concurrent change fails ifMatch, if need be on retry.
      try {
        await txRepo.patchResource<User>('User', user.id, patch, { ifMatch });
      } catch (err) {
        if (ifMatch && err instanceof OperationOutcomeError && err.outcome.id === preconditionFailed.id) {
          getLogger().warn('Password change rejected because the user changed during the request', {
            userId: user.id,
          });
          throw new OperationOutcomeError(badRequest('Incorrect password', 'oldPassword'));
        }
        throw err;
      }
    },
    { resourceTypes: ['User', 'UserSecurityRequest'], source: 'setPassword' }
  );

  await revokeUserLogins(repo, user);
}

/**
 * Revokes every Login of the user, walking all pages of the search.
 * @param repo - The system repository to use.
 * @param user - The user whose Logins should be revoked.
 * @param pageSize - The search page size, at least the minimum page size for cursor pagination.
 */
export async function revokeUserLogins(
  repo: SuperAdminRepository,
  user: WithId<User>,
  pageSize = DEFAULT_MAX_SEARCH_COUNT
): Promise<void> {
  // Ascending _lastUpdated uses cursor pagination. A revoked Login is revisited once after the
  // cursor and skipped by the revoked check.
  await repo.processAllResources<Login>(
    {
      resourceType: 'Login',
      filters: [{ code: 'user', operator: Operator.EQUALS, value: getReferenceString(user) }],
      sortRules: [{ code: '_lastUpdated' }],
      // Smaller pages fall back to offset paging, which skips Logins that move to the end when revoked
      count: Math.max(pageSize, minCursorBasedSearchPageSize),
    },
    async (login) => {
      if (!login.revoked) {
        await repo.patchResource<Login>('Login', login.id, [{ op: 'add', path: '/revoked', value: true }]);
      }
    }
  );
}
