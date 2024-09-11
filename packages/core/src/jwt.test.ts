import { createFakeJwt } from './client-test-utils';
import { isJwt, isMedplumAccessToken, tryGetJwtExpiration } from './jwt';

describe('JWT utils', () => {
  test('isJwt', () => {
    expect(isJwt('')).toBe(false);
    expect(isJwt('header.payload')).toBe(false);
    expect(isJwt(createFakeJwt({ exp: 0 }))).toBe(true);
  });

  test('isMedplumAccessToken', () => {
    expect(isMedplumAccessToken('')).toBe(false);
    expect(isMedplumAccessToken(createFakeJwt({}))).toBe(false);
    expect(isMedplumAccessToken(createFakeJwt({ login_id: '123' }))).toBe(true);
  });

  test('tryGetJwtExpiration', () => {
    expect(tryGetJwtExpiration('')).toBe(undefined);
    expect(tryGetJwtExpiration(createFakeJwt({}))).toBe(undefined);
    expect(tryGetJwtExpiration(createFakeJwt({ exp: 0 }))).toBe(0);
  });
});
