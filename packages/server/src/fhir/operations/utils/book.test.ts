// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { isAlignedTime } from './book';

describe('isAlignedTime', () => {
  test('returns true for times on the hour with default alignment', () => {
    expect(isAlignedTime(new Date('2025-12-01T00:00:00Z'), { alignment: 60, offsetMinutes: 0 })).toBe(true);
    expect(isAlignedTime(new Date('2025-12-01T01:00:00Z'), { alignment: 60, offsetMinutes: 0 })).toBe(true);
    expect(isAlignedTime(new Date('2025-12-01T12:00:00Z'), { alignment: 60, offsetMinutes: 0 })).toBe(true);
  });

  test('returns true for times aligned to half hours', () => {
    expect(isAlignedTime(new Date('2025-12-01T00:00:00Z'), { alignment: 30, offsetMinutes: 0 })).toBe(true);
    expect(isAlignedTime(new Date('2025-12-01T00:30:00Z'), { alignment: 30, offsetMinutes: 0 })).toBe(true);
    expect(isAlignedTime(new Date('2025-12-01T01:00:00Z'), { alignment: 30, offsetMinutes: 0 })).toBe(true);
    expect(isAlignedTime(new Date('2025-12-01T01:30:00Z'), { alignment: 30, offsetMinutes: 0 })).toBe(true);
  });

  test('returns true for times aligned to quarter hours', () => {
    expect(isAlignedTime(new Date('2025-12-01T00:00:00Z'), { alignment: 15, offsetMinutes: 0 })).toBe(true);
    expect(isAlignedTime(new Date('2025-12-01T00:15:00Z'), { alignment: 15, offsetMinutes: 0 })).toBe(true);
    expect(isAlignedTime(new Date('2025-12-01T00:30:00Z'), { alignment: 15, offsetMinutes: 0 })).toBe(true);
    expect(isAlignedTime(new Date('2025-12-01T00:45:00Z'), { alignment: 15, offsetMinutes: 0 })).toBe(true);
  });

  test('returns false for misaligned times', () => {
    expect(isAlignedTime(new Date('2025-12-01T00:10:00Z'), { alignment: 15, offsetMinutes: 0 })).toBe(false);
    expect(isAlignedTime(new Date('2025-12-01T00:20:00Z'), { alignment: 15, offsetMinutes: 0 })).toBe(false);
    expect(isAlignedTime(new Date('2025-12-01T00:35:00Z'), { alignment: 30, offsetMinutes: 0 })).toBe(false);
    expect(isAlignedTime(new Date('2025-12-01T00:05:00Z'), { alignment: 60, offsetMinutes: 0 })).toBe(false);
  });

  test('returns true for times aligned with an offset', () => {
    expect(isAlignedTime(new Date('2025-12-01T00:05:00Z'), { alignment: 15, offsetMinutes: 5 })).toBe(true);
    expect(isAlignedTime(new Date('2025-12-01T00:20:00Z'), { alignment: 15, offsetMinutes: 5 })).toBe(true);
    expect(isAlignedTime(new Date('2025-12-01T00:35:00Z'), { alignment: 15, offsetMinutes: 5 })).toBe(true);
    expect(isAlignedTime(new Date('2025-12-01T00:50:00Z'), { alignment: 15, offsetMinutes: 5 })).toBe(true);
  });

  test('returns false for times not matching the offset alignment', () => {
    expect(isAlignedTime(new Date('2025-12-01T00:00:00Z'), { alignment: 15, offsetMinutes: 5 })).toBe(false);
    expect(isAlignedTime(new Date('2025-12-01T00:15:00Z'), { alignment: 15, offsetMinutes: 5 })).toBe(false);
    expect(isAlignedTime(new Date('2025-12-01T00:30:00Z'), { alignment: 15, offsetMinutes: 5 })).toBe(false);
  });

  test('returns false for times with seconds', () => {
    expect(isAlignedTime(new Date('2025-12-01T00:00:30Z'), { alignment: 15, offsetMinutes: 0 })).toBe(false);
    expect(isAlignedTime(new Date('2025-12-01T00:15:01Z'), { alignment: 15, offsetMinutes: 0 })).toBe(false);
  });

  test('returns false for times with milliseconds', () => {
    expect(isAlignedTime(new Date('2025-12-01T00:00:00.500Z'), { alignment: 15, offsetMinutes: 0 })).toBe(false);
    expect(isAlignedTime(new Date('2025-12-01T00:15:00.001Z'), { alignment: 15, offsetMinutes: 0 })).toBe(false);
  });

  test('handles negative offset', () => {
    // Negative offset of -20 with alignment 30 means times at :10, :40
    expect(isAlignedTime(new Date('2025-12-01T00:10:00Z'), { alignment: 30, offsetMinutes: -20 })).toBe(true);
    expect(isAlignedTime(new Date('2025-12-01T00:40:00Z'), { alignment: 30, offsetMinutes: -20 })).toBe(true);
    expect(isAlignedTime(new Date('2025-12-01T00:00:00Z'), { alignment: 30, offsetMinutes: -20 })).toBe(false);
    expect(isAlignedTime(new Date('2025-12-01T00:30:00Z'), { alignment: 30, offsetMinutes: -20 })).toBe(false);
  });

  test('handles alignment of 1 (every minute)', () => {
    expect(isAlignedTime(new Date('2025-12-01T00:00:00Z'), { alignment: 1, offsetMinutes: 0 })).toBe(true);
    expect(isAlignedTime(new Date('2025-12-01T00:01:00Z'), { alignment: 1, offsetMinutes: 0 })).toBe(true);
    expect(isAlignedTime(new Date('2025-12-01T00:59:00Z'), { alignment: 1, offsetMinutes: 0 })).toBe(true);
  });
});
