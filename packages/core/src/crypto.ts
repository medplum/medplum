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
 * Note that this is not intended for production use, but rather for testing
 * This should be replaced when crypto.randomUUID is fully supported
 * See: https://stackoverflow.com/revisions/2117523/28
 * @returns A random UUID.
 */
export function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
