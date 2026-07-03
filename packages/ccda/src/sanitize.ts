// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Strips `@_nullFlavor` keys from objects recursively.
 * Objects containing only `@_nullFlavor` become undefined and are filtered from arrays.
 * Copy-on-write: values without nullFlavor descendants are returned as-is, without cloning.
 * @param obj - The object to sanitize.
 * @returns The sanitized object with nullFlavor keys removed.
 */
export function sanitizeNullFlavors<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    let result: unknown[] | undefined = undefined;
    for (let i = 0; i < obj.length; i++) {
      const value = sanitizeNullFlavors(obj[i]);
      if (!result) {
        if (value === obj[i] && value !== undefined) {
          continue;
        }
        // First changed item: copy the already-visited items, which are all unchanged
        result = obj.slice(0, i);
      }
      if (value !== undefined) {
        result.push(value);
      }
    }
    return (result ?? obj) as T;
  }

  if (typeof obj === 'object') {
    const source = obj as Record<string, unknown>;
    const keys = Object.keys(source);
    let result: Record<string, unknown> | undefined = undefined;
    let kept = 0;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const value = key === '@_nullFlavor' ? undefined : sanitizeNullFlavors(source[key]);
      if (!result) {
        if (value === source[key] && value !== undefined) {
          kept++;
          continue;
        }
        // First changed key: copy the already-visited keys, which are all unchanged
        result = {};
        for (let j = 0; j < i; j++) {
          result[keys[j]] = source[keys[j]];
        }
      }
      if (value !== undefined) {
        result[key] = value;
        kept++;
      }
    }

    if (kept === 0) {
      return undefined as T;
    }

    return (result ?? obj) as T;
  }

  return obj;
}
