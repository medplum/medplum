// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { decodeBase64Url } from './base64';

/**
 * Recognized JWT Claims Set members, any other members may also be present.
 * @see {@link https://github.com/panva/jose/blob/main/src/types.d.ts#L532}
 */
export interface JWTPayload {
  /**
   * JWT Issuer
   * @see {@link https://www.rfc-editor.org/rfc/rfc7519#section-4.1.1|RFC7519#section-4.1.1}
   */
  iss?: string;

  /**
   * JWT Subject
   * @see {@link https://www.rfc-editor.org/rfc/rfc7519#section-4.1.2|RFC7519#section-4.1.2}
   */
  sub?: string;

  /**
   * JWT Audience
   * @see {@link https://www.rfc-editor.org/rfc/rfc7519#section-4.1.3|RFC7519#section-4.1.3}
   */
  aud?: string | string[];

  /**
   * JWT ID
   * @see {@link https://www.rfc-editor.org/rfc/rfc7519#section-4.1.7|RFC7519#section-4.1.7}
   */
  jti?: string;

  /**
   * JWT Not Before
   * @see {@link https://www.rfc-editor.org/rfc/rfc7519#section-4.1.5|RFC7519#section-4.1.5}
   */
  nbf?: number;

  /**
   * JWT Expiration Time
   * @see {@link https://www.rfc-editor.org/rfc/rfc7519#section-4.1.4|RFC7519#section-4.1.4}
   */
  exp?: number;

  /**
   * JWT Issued At
   * @see {@link https://www.rfc-editor.org/rfc/rfc7519#section-4.1.6|RFC7519#section-4.1.6}
   */
  iat?: number;

  /** Any other JWT Claim Set member. */
  [propName: string]: unknown;
}

/**
 * Decodes a section of a JWT.
 * See: https://tools.ietf.org/html/rfc7519
 * @param payload - The JWT payload string.
 * @returns Collection of key value claims in the JWT payload.
 */
function decodePayload(payload: string): JWTPayload {
  return JSON.parse(decodeBase64Url(payload));
}

/**
 * Returns true if the token is a JWT.
 * @param token - The potential JWT token.
 * @returns True if the token is a JWT.
 */
export function isJwt(token: string): boolean {
  return token.split('.').length === 3;
}

/**
 * Parses the JWT payload.
 * @param token - JWT token.
 * @returns Collection of key value claims in the JWT payload.
 */
export function parseJWTPayload(token: string): JWTPayload {
  const [_header, payload, _signature] = token.split('.');
  return decodePayload(payload);
}

/**
 * Returns true if the access token was issued by a Medplum server.
 * @param accessToken - An access token of unknown origin.
 * @returns True if the access token was issued by a Medplum server.
 */
export function isMedplumAccessToken(accessToken: string): boolean {
  try {
    const payload = parseJWTPayload(accessToken);
    return typeof payload.login_id === 'string';
  } catch (_err) {
    return false;
  }
}

/**
 * Returns the JWT expiration time in number of milliseconds elapsed since the epoch.
 * @param token - The JWT token.
 * @returns The JWT expiration time in number of milliseconds elapsed since the epoch if available, undefined if unknown.
 */
export function tryGetJwtExpiration(token: string): number | undefined {
  try {
    const payload = parseJWTPayload(token);
    const exp = payload.exp;
    if (typeof exp === 'number') {
      return exp * 1000;
    }
    return undefined;
  } catch (_err) {
    return undefined;
  }
}
