// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Strips `@_nullFlavor` keys from objects recursively.
 * Objects containing only `@_nullFlavor` become undefined and are filtered from arrays.
 * @param obj - The object to sanitize.
 * @returns The sanitized object with nullFlavor keys removed.
 */
export function sanitizeNullFlavors<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeNullFlavors(item)).filter((item) => item !== undefined) as T;
  }

  if (typeof obj === 'object') {
    const keys = Object.keys(obj).filter((key) => key !== '@_nullFlavor');

    if (keys.length === 0) {
      return undefined as T;
    }

    const result: Record<string, unknown> = {};
    for (const key of keys) {
      const value = sanitizeNullFlavors((obj as Record<string, unknown>)[key]);
      if (value !== undefined) {
        result[key] = value;
      }
    }

    if (Object.keys(result).length === 0) {
      return undefined as T;
    }

    return result as T;
  }

  return obj;
}
