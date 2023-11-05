/**
 * Decodes a base64 string.
 * Handles both browser and Node environments.
 * @param data - The base-64 encoded input string.
 * @returns The decoded string.
 */
export function decodeBase64(data: string): string {
  if (typeof window !== 'undefined') {
    return window.atob(data);
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(data, 'base64').toString('binary');
  }
  throw new Error('Unable to decode base64');
}

/**
 * Encodes a base64 string.
 * Handles both browser and Node environments.
 * @param data - The unencoded input string.
 * @returns The base-64 encoded string.
 */
export function encodeBase64(data: string): string {
  if (typeof window !== 'undefined') {
    return window.btoa(data);
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(data, 'binary').toString('base64');
  }
  throw new Error('Unable to encode base64');
}
