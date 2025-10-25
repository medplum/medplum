// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { assertReferenceOfType, isBillTo, isPriority, isReferenceOfType } from './types';

describe('isPriority', () => {
  test('should return true for valid priority', () => {
    expect(isPriority('routine')).toBe(true);
  });

  test('should return false for invalid priority', () => {
    expect(isPriority(undefined)).toBe(false);
    expect(isPriority('')).toBe(false);
    expect(isPriority('invalid')).toBe(false);
  });
});

describe('isReferenceOfType', () => {
  test('true for correct types', () => {
    expect(isReferenceOfType('Patient', { reference: 'Patient/123' })).toBe(true);
    expect(() => assertReferenceOfType('Patient', { reference: 'Patient/123' })).not.toThrow();
  });

  test('false for incorrect types', () => {
    expect(isReferenceOfType('Observation', { reference: 'Patient/123' })).toBe(false);
    expect(() => assertReferenceOfType('Observation', { reference: 'Patient/123' })).toThrow();
  });
});

describe('isBillTo', () => {
  test('true for valid billTo', () => {
    expect(isBillTo('patient')).toBe(true);
    expect(isBillTo('insurance')).toBe(true);
    expect(isBillTo('customer-account')).toBe(true);
  });

  test('false for invalid billTo', () => {
    expect(isBillTo(undefined)).toBe(false);
    expect(isBillTo('')).toBe(false);
    expect(isBillTo('invalid')).toBe(false);
  });
});
