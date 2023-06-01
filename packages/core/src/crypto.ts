import { arrayBufferToHex } from './utils';

/**
 * Returns a cryptographically secure random string.
 * @returns A cryptographically secure random string.
 */
export function getRandomString(): string {
  const randomItems = new Uint32Array(28);
  crypto.getRandomValues(randomItems);
  return arrayBufferToHex(randomItems.buffer);
}

/**
 * Encrypts a string with SHA256 encryption.
 * @param str The unencrypted input string.
 * @returns The encrypted value in an ArrayBuffer.
 */
export async function encryptSHA256(str: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
}
