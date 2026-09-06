// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { UserSecurityRequest } from '@medplum/fhirtypes';
import { USER_SECURITY_REQUEST_EXPIRATION_MS } from '../constants';
import { getSecurityRequestExpiration, isSecurityRequestExpired } from './securityrequest';

function makeRequest(overrides: Partial<UserSecurityRequest>): UserSecurityRequest {
  return {
    resourceType: 'UserSecurityRequest',
    type: 'reset',
    user: { reference: 'User/123' },
    secret: 'secret',
    ...overrides,
  };
}

describe('getSecurityRequestExpiration', () => {
  test('Uses the window for the request type', () => {
    const before = Date.now();
    const expiration = new Date(getSecurityRequestExpiration('invite')).getTime();
    expect(expiration).toBeGreaterThanOrEqual(before + USER_SECURITY_REQUEST_EXPIRATION_MS.invite);
  });

  test('Reset expires sooner than invite', () => {
    expect(USER_SECURITY_REQUEST_EXPIRATION_MS.reset).toBeLessThan(USER_SECURITY_REQUEST_EXPIRATION_MS.invite);
  });
});

describe('isSecurityRequestExpired', () => {
  test('Unexpired', () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    expect(isSecurityRequestExpired(makeRequest({ expiresAt }))).toBe(false);
  });

  test('Expired', () => {
    const expiresAt = new Date(Date.now() - 60_000).toISOString();
    expect(isSecurityRequestExpired(makeRequest({ expiresAt }))).toBe(true);
  });

  test('Unparseable expiresAt is expired', () => {
    expect(isSecurityRequestExpired(makeRequest({ expiresAt: 'not-a-date' }))).toBe(true);
  });

  test('Falls back to lastUpdated when expiresAt is absent', () => {
    const recent = new Date(Date.now() - 60_000).toISOString();
    expect(isSecurityRequestExpired(makeRequest({ meta: { lastUpdated: recent } }))).toBe(false);

    const old = new Date(Date.now() - USER_SECURITY_REQUEST_EXPIRATION_MS.reset - 60_000).toISOString();
    expect(isSecurityRequestExpired(makeRequest({ meta: { lastUpdated: old } }))).toBe(true);
  });

  test('Fallback uses the window for the request type', () => {
    const lastUpdated = new Date(Date.now() - USER_SECURITY_REQUEST_EXPIRATION_MS.reset - 60_000).toISOString();
    expect(isSecurityRequestExpired(makeRequest({ type: 'invite', meta: { lastUpdated } }))).toBe(false);
    expect(isSecurityRequestExpired(makeRequest({ type: 'verify-email', meta: { lastUpdated } }))).toBe(false);
  });

  test('Missing type falls back to the reset window', () => {
    const lastUpdated = new Date(Date.now() - USER_SECURITY_REQUEST_EXPIRATION_MS.reset - 60_000).toISOString();
    expect(isSecurityRequestExpired(makeRequest({ type: undefined, meta: { lastUpdated } }))).toBe(true);
  });

  test('No timestamps at all is expired', () => {
    expect(isSecurityRequestExpired(makeRequest({}))).toBe(true);
  });
});
