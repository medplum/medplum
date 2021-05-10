/**
 * Decodes a section of a JWT.
 * See: https://tools.ietf.org/html/rfc7519
 * @param payload
 */
function decodePayload(payload: string) {
  const cleanedPayload = payload.replace(/-/g, '+').replace(/_/g, '/');
  const decodedPayload = atob(cleanedPayload)
  const uriEncodedPayload = Array.from(decodedPayload).reduce((acc, char) => {
    const uriEncodedChar = ('00' + char.charCodeAt(0).toString(16)).slice(-2)
    return `${acc}%${uriEncodedChar}`
  }, '')
  const jsonPayload = decodeURIComponent(uriEncodedPayload);
  return JSON.parse(jsonPayload)
}

/**
 * Parses the JWT payload.
 * @param token JWT token
 */
export function parseJWTPayload(token: string) {
  const [_header, payload, _signature] = token.split('.');
  const jsonPayload = decodePayload(payload);
  return jsonPayload;
}
