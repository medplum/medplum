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
 * @param str - The unencrypted input string.
 * @returns The encrypted value in an ArrayBuffer.
 */
export async function encryptSHA256(str: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
}

/**
 * Cross platform random UUID generator
 * Uses cryptographically secure randomness.
 * @returns A random UUID.
 */
export function generateId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);

  // Set UUID version (4) and variant bits per RFC 4122.
  randomBytes[6] = (randomBytes[6] & 0x0f) | 0x40;
  randomBytes[8] = (randomBytes[8] & 0x3f) | 0x80;

  const hex = arrayBufferToHex(randomBytes.buffer);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
