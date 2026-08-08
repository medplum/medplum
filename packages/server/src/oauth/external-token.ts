// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JWTPayload } from '@medplum/core';
import { badRequest, ContentType, isJwt, OperationOutcomeError, parseJWTPayload, tooManyRequests } from '@medplum/core';
import type { IdentityProvider } from '@medplum/fhirtypes';
import { createRemoteJWKSet, customFetch, jwtVerify } from 'jose';
import { getLogger } from '../logger';
import { safeFetch } from '../util/url';

type TokenVerificationMethod = NonNullable<IdentityProvider['tokenVerificationMethod']>;

/**
 * Verifies a token issued by an external identity provider and returns verified claims.
 * @param idp - External identity provider configuration.
 * @param token - Token issued by the external identity provider.
 * @returns Verified token claims.
 */
export async function verifyExternalToken(idp: IdentityProvider, token: string): Promise<JWTPayload> {
  const method = getExternalTokenVerificationMethod(idp);
  if (method === 'userinfo') {
    return verifyExternalTokenWithUserInfo(idp, token);
  }
  return verifyExternalTokenWithJwks(idp, token);
}

function getExternalTokenVerificationMethod(idp: IdentityProvider): TokenVerificationMethod {
  if (idp.tokenVerificationMethod) {
    return idp.tokenVerificationMethod;
  }
  if (idp.userInfoUrl) {
    return 'userinfo';
  }
  return 'jwks';
}

async function verifyExternalTokenWithUserInfo(idp: IdentityProvider, token: string): Promise<JWTPayload> {
  if (!idp.userInfoUrl) {
    throw new OperationOutcomeError(badRequest('Missing user info URL - check your identity provider configuration'));
  }
  const claims = await getExternalUserInfo(idp.userInfoUrl, token, idp);
  assertExternalTokenAudience(idp, isJwt(token) ? parseJWTPayload(token) : claims);
  return claims;
}

async function verifyExternalTokenWithJwks(idp: IdentityProvider, token: string): Promise<JWTPayload> {
  const log = getLogger();
  const jwksUrl = idp.jwksUrl;
  if (!jwksUrl) {
    throw new OperationOutcomeError(badRequest('Missing JWKS URL - check your identity provider configuration'));
  }
  if (!idp.issuer) {
    throw new OperationOutcomeError(badRequest('Missing issuer - check your identity provider configuration'));
  }

  try {
    const JWKS = createRemoteJWKSet(new URL(jwksUrl), { [customFetch]: safeFetch });
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: idp.issuer,
    });
    assertExternalTokenAudience(idp, payload);
    return payload;
  } catch (err: unknown) {
    log.warn('Failed to verify external token with JWKS', { err, jwksUrl, clientId: idp.clientId });
    throw new OperationOutcomeError(badRequest('Failed to verify token - check your identity provider configuration'));
  }
}

function assertExternalTokenAudience(idp: IdentityProvider, claims: JWTPayload): void {
  const expectedAudience = idp.audience;
  if (!expectedAudience) {
    return;
  }

  if (!tokenAudienceMatches(claims.aud, expectedAudience)) {
    throw new OperationOutcomeError(badRequest('Invalid token audience - check your identity provider configuration'));
  }
}

function tokenAudienceMatches(
  actualAudience: string | string[] | undefined,
  expectedAudience: string | string[]
): boolean {
  const expectedAudiences = Array.isArray(expectedAudience) ? expectedAudience : [expectedAudience];
  let actualAudiences: string[];
  if (Array.isArray(actualAudience)) {
    actualAudiences = actualAudience;
  } else if (actualAudience) {
    actualAudiences = [actualAudience];
  } else {
    actualAudiences = [];
  }

  return actualAudiences.some((audience) => expectedAudiences.includes(audience));
}

/**
 * Returns the external identity provider user info for an access token.
 * This can be used to verify the access token and get the user's email address.
 * @param userInfoUrl - The user info URL from the identity provider configuration.
 * @param externalAccessToken - The external identity provider access token.
 * @param idp - Optional identity provider configuration.
 * @returns The user info claims.
 */
export async function getExternalUserInfo(
  userInfoUrl: string,
  externalAccessToken: string,
  idp?: IdentityProvider
): Promise<JWTPayload> {
  const log = getLogger();

  const request = buildExternalUserInfoRequest(userInfoUrl, externalAccessToken, idp);

  let response;
  try {
    response = await safeFetch(request.url, request.init);
  } catch (err: any) {
    log.warn('Error while verifying external auth code', err);
    throw new OperationOutcomeError(badRequest('Failed to verify code - check your identity provider configuration'));
  }

  if (response.status === 429) {
    log.warn('Auth rate limit exceeded', { url: request.url, clientId: idp?.clientId });
    throw new OperationOutcomeError(tooManyRequests);
  }

  if (response.status !== 200) {
    log.warn('Failed to verify external authorization code', { status: response.status });
    throw new OperationOutcomeError(badRequest('Failed to verify code - check your identity provider configuration'));
  }

  const contentType = response.headers.get('content-type');
  try {
    if (contentType?.includes(ContentType.JSON)) {
      return normalizeExternalUserInfo(await response.json(), idp);
    } else if (contentType?.includes(ContentType.JWT)) {
      return parseJWTPayload(await response.text());
    }
  } catch (err: any) {
    if (err instanceof OperationOutcomeError) {
      throw err;
    }
    log.warn('Failed to verify external authorization code', { err, userInfoUrl, contentType });
    throw new OperationOutcomeError(badRequest('Failed to verify code - check your identity provider configuration'));
  }

  throw new OperationOutcomeError(badRequest(`Failed to verify code - unsupported content type: ${contentType}`));
}

function buildExternalUserInfoRequest(
  userInfoUrl: string,
  externalAccessToken: string,
  idp: IdentityProvider | undefined
): { url: string; init: RequestInit } {
  if (idp?.userInfoMode === 'gcip') {
    const apiKey = idp.userInfoApiKey;
    if (!apiKey) {
      throw new OperationOutcomeError(
        badRequest('Missing user info API key - check your identity provider configuration')
      );
    }

    const url = new URL(userInfoUrl);
    url.searchParams.set('key', apiKey);

    return {
      url: url.toString(),
      init: {
        method: 'POST',
        headers: {
          Accept: ContentType.JSON,
          'Accept-Encoding': 'identity',
          'Content-Type': ContentType.JSON,
        },
        body: JSON.stringify({ idToken: externalAccessToken }),
      },
    };
  }

  return {
    url: userInfoUrl,
    init: {
      method: 'GET',
      headers: {
        Accept: ContentType.JSON,
        'Accept-Encoding': 'identity',
        Authorization: `Bearer ${externalAccessToken}`,
      },
    },
  };
}

function normalizeExternalUserInfo(body: Record<string, unknown>, idp?: IdentityProvider): Record<string, unknown> {
  if (idp?.userInfoMode !== 'gcip') {
    return body;
  }

  const users = body.users;
  if (!Array.isArray(users) || users.length === 0 || !users[0] || typeof users[0] !== 'object') {
    throw new OperationOutcomeError(badRequest('Failed to verify code - invalid user info response'));
  }

  const user = users[0] as Record<string, unknown>;
  if (!user.localId) {
    throw new OperationOutcomeError(badRequest('Failed to verify code - missing localId in user info response'));
  }
  return {
    ...user,
    sub: user.localId,
  };
}
