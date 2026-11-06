// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test, vi } from 'vitest';
import {
  exchangeCode,
  GoogleOAuthError,
  hasCalendarScope,
  readIdToken,
  refreshAccessToken,
  revokeToken,
} from './google-oauth';

const client = { clientId: 'cid', clientSecret: 'secret' };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function idToken(claims: Record<string, unknown>): string {
  const b64 = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${b64({ alg: 'RS256' })}.${b64(claims)}.sig`;
}

describe('google-oauth', () => {
  test('exchangeCode posts the code grant with PKCE and the redirect URI', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        json(200, { access_token: 'at', refresh_token: 'rt', expires_in: 3599, scope: 's', token_type: 'Bearer' })
      );
    const tokens = await exchangeCode(
      client,
      { code: 'c', codeVerifier: 'v', redirectUri: 'https://app.example/cb' },
      fetchMock
    );
    expect(tokens.refresh_token).toBe('rt');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    const form = new URLSearchParams((init as RequestInit).body as string);
    expect(Object.fromEntries(form)).toEqual({
      grant_type: 'authorization_code',
      client_id: 'cid',
      client_secret: 'secret',
      code: 'c',
      code_verifier: 'v',
      redirect_uri: 'https://app.example/cb',
    });
  });

  test('refreshAccessToken surfaces invalid_grant as a reconnect signal', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        json(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' })
      );
    const promise = refreshAccessToken(client, 'rt', fetchMock);
    await expect(promise).rejects.toBeInstanceOf(GoogleOAuthError);
    await expect(promise).rejects.toMatchObject({ status: 400, code: 'invalid_grant', isInvalidGrant: true });
  });

  test('refreshAccessToken returns the new access token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json(200, { access_token: 'at2', expires_in: 3599, scope: 's', token_type: 'Bearer' }));
    const tokens = await refreshAccessToken(client, 'rt', fetchMock);
    expect(tokens.access_token).toBe('at2');
    expect(tokens.refresh_token).toBeUndefined();
    expect(Object.fromEntries(new URLSearchParams((fetchMock.mock.calls[0][1] as RequestInit).body as string))).toEqual(
      {
        grant_type: 'refresh_token',
        client_id: 'cid',
        client_secret: 'secret',
        refresh_token: 'rt',
      }
    );
  });

  test('revokeToken tolerates an already-revoked token', async () => {
    const ok = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    await expect(revokeToken('rt', ok as unknown as typeof fetch)).resolves.toBeUndefined();
    const gone = vi.fn().mockResolvedValue(json(400, { error: 'invalid_token' }));
    await expect(revokeToken('rt', gone as unknown as typeof fetch)).resolves.toBeUndefined();
    const down = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    await expect(revokeToken('rt', down as unknown as typeof fetch)).rejects.toMatchObject({ status: 503 });
  });

  test('readIdToken extracts sub, email and hd without verifying', () => {
    expect(readIdToken(idToken({ sub: '123', email: 'dr@clinic.example', hd: 'clinic.example' }))).toEqual({
      sub: '123',
      email: 'dr@clinic.example',
      hd: 'clinic.example',
    });
    expect(readIdToken(idToken({ sub: '123' }))).toEqual({ sub: '123', email: undefined, hd: undefined });
    expect(() => readIdToken('nope')).toThrow('Malformed id_token');
    expect(() => readIdToken(idToken({ email: 'x' }))).toThrow('no sub');
  });

  test('hasCalendarScope checks the granted scope string', () => {
    expect(hasCalendarScope('openid email https://www.googleapis.com/auth/calendar.events.owned')).toBe(true);
    expect(hasCalendarScope('openid email')).toBe(false);
    expect(hasCalendarScope(undefined)).toBe(false);
  });
});
