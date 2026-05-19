// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { sanitizeNullFlavors } from './sanitize';

describe('sanitizeNullFlavors', () => {
  test('returns undefined for object with only @_nullFlavor', () => {
    expect(sanitizeNullFlavors({ '@_nullFlavor': 'NA' })).toBeUndefined();
  });

  test('strips @_nullFlavor but preserves other properties', () => {
    const input = { '@_nullFlavor': 'OTH', translation: [{ '@_code': '123' }] };
    const result = sanitizeNullFlavors(input);
    expect(result).toEqual({ translation: [{ '@_code': '123' }] });
  });

  test('recursively sanitizes nested objects', () => {
    const input = {
      name: [{ '@_nullFlavor': 'UNK' }],
      code: { '@_code': '123' },
    };
    const result = sanitizeNullFlavors(input);
    expect(result).toEqual({ name: [], code: { '@_code': '123' } });
  });

  test('filters undefined from arrays', () => {
    const input = ['valid', { '@_nullFlavor': 'NA' }, 'also-valid'];
    const result = sanitizeNullFlavors(input);
    expect(result).toEqual(['valid', 'also-valid']);
  });

  test('preserves primitive values unchanged', () => {
    expect(sanitizeNullFlavors('string')).toBe('string');
    expect(sanitizeNullFlavors(123)).toBe(123);
    expect(sanitizeNullFlavors(true)).toBe(true);
    expect(sanitizeNullFlavors(null)).toBeNull();
    expect(sanitizeNullFlavors(undefined)).toBeUndefined();
  });

  test('returns undefined when all children recursively resolve to null-flavored', () => {
    const input = {
      a: { '@_nullFlavor': 'NA' },
      b: { '@_nullFlavor': 'UNK' },
    };
    expect(sanitizeNullFlavors(input)).toBeUndefined();
  });

  test('handles deeply nested nullFlavor objects', () => {
    const input = {
      level1: {
        level2: {
          level3: { '@_nullFlavor': 'NA' },
          valid: 'value',
        },
      },
    };
    const result = sanitizeNullFlavors(input);
    expect(result).toEqual({
      level1: {
        level2: {
          valid: 'value',
        },
      },
    });
  });

  test('removes keys with undefined values after sanitization', () => {
    const input = {
      nullField: { '@_nullFlavor': 'NA' },
      validField: 'value',
    };
    const result = sanitizeNullFlavors(input);
    expect(result).toEqual({ validField: 'value' });
    expect('nullField' in (result as object)).toBe(false);
  });
});
