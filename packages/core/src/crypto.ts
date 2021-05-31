import { arrayBufferToHex } from './utils';

/**
 * Returns a cryptographically secure random string.
 */
export function getRandomString() {
  const randomItems = new Uint32Array(28);
  crypto.getRandomValues(randomItems);
  return arrayBufferToHex(randomItems.buffer);
}

/**
 * Encrypts a string with SHA256 encryption.
 * @param str
 */
export async function encryptSHA256(str: string) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
}
