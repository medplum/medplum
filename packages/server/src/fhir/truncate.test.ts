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

  test('truncates ASCII string to maximum bytes, not a fixed character count', () => {
    const value = 'a'.repeat(2705);
    const result = truncateTextColumn(value) as string;
    expect(result).toBeDefined();
    // ASCII: 1 byte per char, so we keep 2704 characters
    expect(result.length).toBe(2704);
    expect(new TextEncoder().encode(result).length).toBeLessThanOrEqual(2704);
  });

  test('truncates very long string', () => {
    const value = 'a'.repeat(5000);
    const result = truncateTextColumn(value) as string;
    expect(result).toBeDefined();
    expect(result.length).toBe(2704);
    expect(new TextEncoder().encode(result).length).toBeLessThanOrEqual(2704);
  });

  test('handles multi-byte UTF-8 characters', () => {
    // Each emoji is 4 bytes in UTF-8, so 676 emojis = 2704 bytes (fits)
    const fitting = '\u{1F600}'.repeat(676);
    expect(truncateTextColumn(fitting)).toBe(fitting);

    // 677 emojis = 2708 bytes (exceeds), should truncate to 676 complete characters
    const exceeding = '\u{1F600}'.repeat(677);
    const result = truncateTextColumn(exceeding) as string;
    expect(result).toBeDefined();
    expect(result).toBe(fitting);
    expect(Array.from(result).length).toBe(676);
    expect(new TextEncoder().encode(result).length).toBe(2704);
  });

  test('handles mixed ASCII and multi-byte characters', () => {
    // 2700 ASCII bytes + 2 emojis (8 bytes) = 2708 bytes, exceeds limit
    const value = 'a'.repeat(2700) + '\u{1F600}\u{1F600}';
    const result = truncateTextColumn(value) as string;
    expect(result).toBeDefined();
    expect(new TextEncoder().encode(result).length).toBeLessThanOrEqual(2704);
    // Should keep all 2700 ASCII chars + 1 emoji (2704 bytes total)
    expect(result).toBe('a'.repeat(2700) + '\u{1F600}');
  });
});
