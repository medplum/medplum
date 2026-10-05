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

  test('returns unchanged values by reference (copy-on-write)', () => {
    const input = { code: { '@_code': '123' }, name: [{ given: ['Alice'] }] };
    const result = sanitizeNullFlavors(input);
    expect(result).toBe(input);
  });

  test('copies only the changed branches, sharing the rest', () => {
    const input = {
      changed: { '@_nullFlavor': 'NA', keep: 'x' },
      untouched: { deep: ['y'] },
    };
    const result = sanitizeNullFlavors(input);
    expect(result).not.toBe(input);
    expect(result.changed).toEqual({ keep: 'x' });
    expect(result.untouched).toBe(input.untouched);
  });

  test('does not mutate the input when stripping', () => {
    const input = { keep: 'x', drop: { '@_nullFlavor': 'NA' } };
    const snapshot = JSON.parse(JSON.stringify(input));
    expect(sanitizeNullFlavors(input)).toEqual({ keep: 'x' });
    expect(input).toEqual(snapshot);
  });
});
