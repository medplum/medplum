// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getExtension, TimezoneExtensionURI } from '@medplum/core';
import type { Appointment, Slot } from '@medplum/fhirtypes';

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

/**
 * The timezone a resource names for itself, if the runtime can read it. Any producer can write
 * the extension, so a zone the runtime cannot resolve is dropped rather than left to throw.
 * @param resource - The appointment or slot that may name its timezone.
 * @returns The IANA identifier, or undefined when none is named or it cannot be resolved.
 */
export function getOwnTimezone(resource: Pick<Appointment | Slot, 'extension'>): string | undefined {
  const code = getExtension(resource, TimezoneExtensionURI)?.valueCode;
  return code && isSupportedTimezone(code) ? code : undefined;
}
