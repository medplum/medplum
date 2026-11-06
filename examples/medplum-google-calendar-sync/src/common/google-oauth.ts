// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { BotEvent } from '@medplum/core';
import { GOOGLE_CALENDAR_METADATA_SCOPE, GOOGLE_CALENDAR_SCOPE, SECRET } from './constants';

/*
 * Google OAuth for one practitioner: the authorization-code exchange at connect, the
 * refresh-token exchange every Bot run, and revocation at disconnect.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

export interface GoogleOAuthClient {
  clientId: string;
  clientSecret: string;
}

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  /** Present on the code exchange. */
  refresh_token?: string;
  id_token?: string;
}

/** What the `id_token` says about the Google account. */
export interface GoogleAccount {
  sub: string;
  email?: string;
  /** The Workspace domain; absent for personal accounts. */
  hd?: string;
}

/** A failed token request. `invalid_grant` means the practitioner must reconnect. */
export class GoogleOAuthError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string
  ) {
    super(message);
    this.name = 'GoogleOAuthError';
  }

  get isInvalidGrant(): boolean {
    return this.code === 'invalid_grant';
  }
}

/**
 * The customer's Google OAuth client from project secrets.
 * @param secrets - The Bot's secrets.
 * @returns The client credentials.
 */
export function getOAuthClient(secrets: BotEvent['secrets']): GoogleOAuthClient {
  const read = (name: string): string => {
    const value = secrets?.[name]?.valueString?.trim();
    if (!value) {
      throw new Error(`Missing secret: ${name}`);
    }
    return value;
  };
  return { clientId: read(SECRET.clientId), clientSecret: read(SECRET.clientSecret) };
}

async function postForm(
  url: string,
  form: Record<string, string>,
  fetchImpl: typeof fetch
): Promise<GoogleTokenResponse> {
  const response = await fetchImpl(url, {
    method: 'POST',
    signal: AbortSignal.timeout(30_000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(form).toString(),
  });
  if (!response.ok) {
    let body: { error?: string; error_description?: string } = {};
    try {
      body = (await response.json()) as typeof body;
    } catch {
      // Not JSON; the status is all we have.
    }
    throw new GoogleOAuthError(
      response.status,
      body.error,
      `Google OAuth ${response.status}: ${body.error ?? 'request failed'}`
    );
  }
  return (await response.json()) as GoogleTokenResponse;
}

/**
 * Exchanges the authorization code the callback page received for tokens.
 * @param client - The customer's OAuth client.
 * @param params - The code, the PKCE verifier, and the redirect URI used to get the code.
 * @param params.code - The authorization code.
 * @param params.codeVerifier - The PKCE verifier the frontend generated.
 * @param params.redirectUri - Must match the authorize request exactly.
 * @param fetchImpl - Injectable for tests.
 * @returns The token response, including the refresh token.
 */
export async function exchangeCode(
  client: GoogleOAuthClient,
  params: { code: string; codeVerifier: string; redirectUri: string },
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<GoogleTokenResponse> {
  return postForm(
    TOKEN_URL,
    {
      grant_type: 'authorization_code',
      client_id: client.clientId,
      client_secret: client.clientSecret,
      code: params.code,
      code_verifier: params.codeVerifier,
      redirect_uri: params.redirectUri,
    },
    fetchImpl
  );
}

/**
 * Exchanges a refresh token for a short-lived access token. Throws a `GoogleOAuthError`
 * with `isInvalidGrant` when the practitioner has to reconnect.
 * @param client - The customer's OAuth client.
 * @param refreshToken - The refresh token.
 * @param fetchImpl - Injectable for tests.
 * @returns The token response.
 */
export async function refreshAccessToken(
  client: GoogleOAuthClient,
  refreshToken: string,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<GoogleTokenResponse> {
  return postForm(
    TOKEN_URL,
    {
      grant_type: 'refresh_token',
      client_id: client.clientId,
      client_secret: client.clientSecret,
      refresh_token: refreshToken,
    },
    fetchImpl
  );
}

/**
 * Revokes a refresh token. A token Google no longer knows is already revoked, so 400 is not
 * an error here; anything else is.
 * @param token - The refresh token.
 * @param fetchImpl - Injectable for tests.
 */
export async function revokeToken(token: string, fetchImpl: typeof fetch = globalThis.fetch): Promise<void> {
  const response = await fetchImpl(REVOKE_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(30_000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }).toString(),
  });
  if (!response.ok && response.status !== 400) {
    throw new GoogleOAuthError(response.status, undefined, `Google OAuth revoke ${response.status}`);
  }
}

/**
 * Reads the account claims out of an `id_token`.
 *
 * The signature is not verified: the token arrived in Google's own response to the code
 * exchange over TLS, authenticated by the client secret, so it can't have been forged.
 * Never call this on a token that came from the browser.
 * @param idToken - The JWT from the code exchange.
 * @returns The account claims.
 */
export function readIdToken(idToken: string): GoogleAccount {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed id_token');
  }
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Partial<GoogleAccount>;
  if (!claims.sub) {
    throw new Error('id_token has no sub');
  }
  return { sub: claims.sub, email: claims.email, hd: claims.hd };
}

/**
 * Whether the granted scopes include calendar write access. The practitioner can untick
 * scopes on Google's consent screen, so a successful exchange doesn't prove it.
 * @param scope - The space-separated `scope` from the token response.
 * @returns True when events can be written.
 */
export function hasCalendarScope(scope: string | undefined): boolean {
  return (scope ?? '').split(/\s+/).includes(GOOGLE_CALENDAR_SCOPE);
}

/**
 * Whether the grant can resolve primary's actual calendar ID as well as read/write owned events.
 * @param scope - Space-separated scopes granted by Google.
 * @returns True when both required scopes were granted.
 */
export function hasImportScopes(scope: string | undefined): boolean {
  return hasCalendarScope(scope) && (scope ?? '').split(/\s+/).includes(GOOGLE_CALENDAR_METADATA_SCOPE);
}
