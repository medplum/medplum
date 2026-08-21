// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from 'vitest';
import { formatFaxNumber } from './fax.utils';

describe('formatFaxNumber', () => {
  test('Formats a 10 digit number', () => {
    expect(formatFaxNumber('5551234567')).toBe('+1 (555) 123-4567');
  });

  test('Formats an 11 digit number with a US country code', () => {
    expect(formatFaxNumber('15551234567')).toBe('+1 (555) 123-4567');
  });

  test('Ignores punctuation already in the number', () => {
    expect(formatFaxNumber('+1 (555) 123-4567')).toBe('+1 (555) 123-4567');
    expect(formatFaxNumber('555.123.4567')).toBe('+1 (555) 123-4567');
  });

  test('Returns anything it cannot recognize unchanged', () => {
    // An 11 digit number that isn't +1, a short number, and a name all pass through, so a
    // display value that was never a phone number is not mangled into one.
    expect(formatFaxNumber('25551234567')).toBe('25551234567');
    expect(formatFaxNumber('555-1234')).toBe('555-1234');
    expect(formatFaxNumber('Springfield Clinic')).toBe('Springfield Clinic');
    expect(formatFaxNumber('')).toBe('');
  });
});
