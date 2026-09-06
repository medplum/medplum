// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import {
  badRequest,
  EMPTY,
  getReferenceString,
  getStatus,
  isOperationOutcome,
  OperationOutcomeError,
  Operator,
} from '@medplum/core';
import type { User, UserSecurityRequest } from '@medplum/fhirtypes';
import { USER_SECURITY_REQUEST_EXPIRATION_MS } from '../constants';
import type { SystemRepository } from '../fhir/repo';

/**
 * How many of a user's most recent security requests are examined when superseding prior requests.
 *
 * Only unexpired requests are worth superseding, and expiration bounds how many of those can
 * exist, so there is no need to walk a user's entire history.
 */
const MAX_SUPERSEDED_REQUESTS = 100;

/**
 * Returns how long a request of the given type stays valid, in milliseconds.
 * @param type - The request type, absent on requests created before the field existed.
 * @returns The validity window in milliseconds.
 */
function getExpirationMs(type: UserSecurityRequest['type']): number {
  // Requests predating the `type` field are treated as password resets, the shortest window.
  return USER_SECURITY_REQUEST_EXPIRATION_MS[type ?? 'reset'];
}

/**
 * Returns the expiration timestamp to store on a newly created UserSecurityRequest.
 * @param type - The type of request being created.
 * @returns The expiration as an ISO 8601 instant.
 */
export function getSecurityRequestExpiration(type: UserSecurityRequest['type']): string {
  return new Date(Date.now() + getExpirationMs(type)).toISOString();
}

/**
 * Returns whether a security request is past its expiration and can no longer be used.
 *
 * Requests created before `expiresAt` existed do not carry the field, so they fall back to their
 * creation time plus the window for their type. That retires previously unlimited tokens as soon
 * as this code is deployed. A request with no timestamps at all is treated as expired.
 * @param securityRequest - The request to check.
 * @returns True if the request has expired.
 */
export function isSecurityRequestExpired(securityRequest: UserSecurityRequest): boolean {
  const expiresAt = securityRequest.expiresAt
    ? new Date(securityRequest.expiresAt).getTime()
    : new Date(securityRequest.meta?.lastUpdated ?? 0).getTime() + getExpirationMs(securityRequest.type);
  return !(expiresAt > Date.now());
}

/**
 * Marks a security request as used, guarded by its version ID.
 *
 * `ifMatch` makes this a compare-and-swap: of several concurrent requests carrying the same
 * token, exactly one gets past this point and the rest see "Already used".
 * @param systemRepo - The system repository to use.
 * @param securityRequest - The request to consume.
 */
export async function consumeSecurityRequest(
  systemRepo: SystemRepository,
  securityRequest: WithId<UserSecurityRequest>
): Promise<void> {
  try {
    await systemRepo.updateResource<UserSecurityRequest>(
      { ...securityRequest, used: true },
      { ifMatch: securityRequest.meta?.versionId }
    );
  } catch (err) {
    if (err instanceof OperationOutcomeError && isOperationOutcome(err.outcome) && getStatus(err.outcome) === 412) {
      throw new OperationOutcomeError(badRequest('Already used'));
    }
    throw err;
  }
}

/**
 * Marks all of the user's prior unused requests of the given type as used.
 *
 * Issuing a new request invalidates the ones it replaces, so an older link that reached the
 * wrong inbox cannot be redeemed after the user asks for a new one.
 * @param systemRepo - The system repository to use.
 * @param user - The user whose prior requests should be superseded.
 * @param type - The type of request being superseded.
 */
export async function supersedePriorSecurityRequests(
  systemRepo: SystemRepository,
  user: WithId<User>,
  type: UserSecurityRequest['type']
): Promise<void> {
  const priorRequests = await systemRepo.search<UserSecurityRequest>({
    resourceType: 'UserSecurityRequest',
    count: MAX_SUPERSEDED_REQUESTS,
    sortRules: [{ code: '_lastUpdated', descending: true }],
    filters: [{ code: 'user', operator: Operator.EQUALS, value: getReferenceString(user) }],
  });

  for (const entry of priorRequests.entry ?? EMPTY) {
    const priorRequest = entry.resource as WithId<UserSecurityRequest>;
    if (priorRequest.type === type && !priorRequest.used) {
      await systemRepo.updateResource<UserSecurityRequest>({ ...priorRequest, used: true });
    }
  }
}
