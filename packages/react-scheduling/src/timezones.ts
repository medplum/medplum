// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Whether the runtime can interpret a timezone identifier. Aliases and unusual casing are accepted, the way
 * scheduling accepts them.
 * @param value - The IANA identifier to test.
 * @returns True when the runtime resolves it.
 */
export function isSupportedTimezone(value: string): boolean {
  try {
    // Constructing the formatter is the check: an identifier the runtime cannot resolve throws here.
    Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
