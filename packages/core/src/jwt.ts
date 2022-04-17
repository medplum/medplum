/**
 * Decodes a section of a JWT.
 * See: https://tools.ietf.org/html/rfc7519
 * @param payload
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

function decodeBase64(data: string): string {
  if (typeof window !== 'undefined') {
    return window.atob(data);
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(data, 'base64').toString('binary');
  }
  throw new Error('Unable to decode base64');
}

/**
 * Parses the JWT payload.
 * @param token JWT token
 */
export function parseJWTPayload(token: string): Record<string, number | string> {
  const [_header, payload, _signature] = token.split('.');
  return decodePayload(payload);
}
