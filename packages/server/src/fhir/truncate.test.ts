// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { truncateTextColumn } from './truncate';

describe('truncateTextColumn', () => {
  test('returns undefined for undefined', () => {
    expect(truncateTextColumn(undefined)).toBeUndefined();
  });

  test('returns undefined for empty string', () => {
    expect(truncateTextColumn('')).toBeUndefined();
  });

  test('returns short string unchanged', () => {
    expect(truncateTextColumn('hello')).toBe('hello');
  });

  test('returns string at exactly 2704 bytes unchanged', () => {
    const value = 'a'.repeat(2704);
    expect(truncateTextColumn(value)).toBe(value);
  });

  test('truncates string exceeding 2704 bytes', () => {
    const value = 'a'.repeat(2705);
    const result = truncateTextColumn(value) as string;
    expect(result).toBeDefined();
    expect(result.length).toBe(675);
  });

  test('truncates very long string', () => {
    const value = 'a'.repeat(5000);
    const result = truncateTextColumn(value) as string;
    expect(result).toBeDefined();
    expect(result.length).toBe(675);
  });

  test('handles multi-byte UTF-8 characters', () => {
    // Each emoji is 4 bytes in UTF-8, so 676 emojis = 2704 bytes (fits)
    const fitting = '\u{1F600}'.repeat(676);
    expect(truncateTextColumn(fitting)).toBe(fitting);

    // 677 emojis = 2708 bytes (exceeds), should truncate to 675 characters
    const exceeding = '\u{1F600}'.repeat(677);
    const result = truncateTextColumn(exceeding) as string;
    expect(result).toBeDefined();
    expect(Array.from(result).length).toBe(675);
  });
});
