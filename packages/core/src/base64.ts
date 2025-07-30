/**
 * Decodes a base64 string.
 * Handles both browser and Node environments.
 * Supports Unicode characters.
 * @param data - The base-64 encoded input string.
 * @returns The decoded string.
 */
export function decodeBase64(data: string): string {
  if (typeof window !== 'undefined') {
    const binaryString = window.atob(data);
    const bytes = Uint8Array.from(binaryString, (c) => c.charCodeAt(0));
    return new window.TextDecoder().decode(bytes);
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(data, 'base64').toString('utf-8');
  }
  throw new Error('Unable to decode base64');
}

/**
 * Encodes a base64 string.
 * Handles both browser and Node environments.
 * Supports Unicode characters.
 * @param data - The unencoded input string.
 * @returns The base-64 encoded string.
 */
export function encodeBase64(data: string): string {
  if (typeof window !== 'undefined') {
    const utf8Bytes = new window.TextEncoder().encode(data);
    // utf8Bytes is a Uint8Array, but String.fromCharCode expects a sequence of numbers.
    const binaryString = String.fromCharCode.apply(null, utf8Bytes as unknown as number[]);
    return window.btoa(binaryString);
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(data, 'utf8').toString('base64');
  }
  throw new Error('Unable to encode base64');
}

/**
 * Encodes a string into Base64URL format.
 * This is the encoding required for JWT parts.
 * @param data - The unencoded input string.
 * @returns The Base64URL encoded string.
 */
export function encodeBase64Url(data: string): string {
  return encodeBase64(data)
    .replace(/\+/g, '-') // Replace + with -
    .replace(/\//g, '_') // Replace / with _
    .replace(/[=]{1,2}$/, ''); // Remove trailing =
}

/**
 * Decodes a string from Base64URL format.
 * @param data - The Base64URL encoded input string.
 * @returns The decoded string.
 */
export function decodeBase64Url(data: string): string {
  data = data.padEnd(data.length + ((4 - (data.length % 4)) % 4), '=');
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return decodeBase64(base64);
}
