// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { HumanName } from '@medplum/fhirtypes';
import { formatHumanName, getSimplePhone } from './cms1500pdf';

describe('CMS 1500 PDF Utils', () => {
  test('formats full name with middle name', () => {
    const name: HumanName = {
      family: 'Smith',
      given: ['John', 'Michael'],
    };
    expect(formatHumanName(name)).toBe('Smith, John, Michael');
  });

  test('returns empty string when name has no family and no given names', () => {
    const name: HumanName = {
      family: undefined,
      given: [],
    };
    expect(formatHumanName(name)).toBe('');
  });

  test('formats name without middle name', () => {
    const name: HumanName = {
      family: 'Smith',
      given: ['John'],
    };
    expect(formatHumanName(name)).toBe('Smith, John');
  });

  test('returns empty string when name is undefined', () => {
    expect(formatHumanName(undefined)).toBe('');
  });

  test('formats multiple middle names', () => {
    const name: HumanName = {
      family: 'Smith',
      given: ['John', 'Michael', 'Robert'],
    };
    expect(formatHumanName(name)).toBe('Smith, John, Michael Robert');
  });

  test('formats family name only', () => {
    const name: HumanName = {
      family: 'Smith',
    };
    expect(formatHumanName(name)).toBe('Smith');
  });

  test('formats given names only', () => {
    const name: HumanName = {
      given: ['John', 'Michael'],
    };
    expect(formatHumanName(name)).toBe('John, Michael');
  });

  test('handles empty name', () => {
    const name: HumanName = {};
    expect(formatHumanName(name)).toBe('');
  });

  test('handles undefined fields', () => {
    const name: HumanName = {
      family: undefined,
      given: undefined,
    };
    expect(formatHumanName(name)).toBe('');
  });

  test('returns undefined when input is undefined', () => {
    expect(getSimplePhone(undefined)).toBeUndefined();
  });

  test('returns undefined when input is empty string', () => {
    expect(getSimplePhone('')).toBeUndefined();
  });

  test('removes tel: prefix from the beginning of phone numbers', () => {
    expect(getSimplePhone('tel:1234567890')).toBe('234567890');
  });

  test('removes +1 prefix from the beginning of phone numbers', () => {
    expect(getSimplePhone('+11234567890')).toBe('234567890');
  });

  test('removes standalone 1 prefix from the beginning of phone numbers', () => {
    expect(getSimplePhone('11234567890')).toBe('1234567890');
  });
});
