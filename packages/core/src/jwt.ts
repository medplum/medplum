import { decodeBase64 } from './base64';

/**
 * Decodes a section of a JWT.
 * See: https://tools.ietf.org/html/rfc7519
 * @param payload - The JWT payload string.
 * @returns Collection of key value claims in the JWT payload.
 */
function decodePayload(payload: string): Record<string, number | string> {
  const cleanedPayload = payload.replace(/-/g, '+').replace(/_/g, '/');
  const decodedPayload = decodeBase64(cleanedPayload);
  const uriEncodedPayload = Array.from(decodedPayload).reduce((acc, char) => {
    const uriEncodedChar = ('00' + char.charCodeAt(0).toString(16)).slice(-2);
    return `${acc}%${uriEncodedChar}`;
  }, '');
  const jsonPayload = decodeURIComponent(uriEncodedPayload);
  return JSON.parse(jsonPayload);
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
export function parseJWTPayload(token: string): Record<string, number | string> {
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
