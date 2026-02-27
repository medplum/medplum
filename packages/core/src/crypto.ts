// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
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
 * @returns A random UUID.
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  // crypto.randomUUID() is available only in secure contexts (HTTPS).
  // Use this non-cryptographically secure fallback for non-secure contexts.
  // See: https://stackoverflow.com/revisions/2117523/28
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replaceAll(/[xy]/g, (c) => {
    const r = Math.trunc(Math.random() * 16);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
