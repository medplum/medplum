// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { bufferTimeConflicts } from './find';

describe('bufferTimeConflicts', () => {
  const interval = { start: new Date('2025-12-01T10:00:00Z'), end: new Date('2025-12-01T11:00:00Z') };
  const buffers = { bufferBefore: 20, bufferAfter: 20 };

  test('returns false without any blocked time', () => {
    expect(bufferTimeConflicts(interval, [], buffers)).toBe(false);
  });

  test('returns false when the appointment has no buffers', () => {
    const blocked = [{ start: new Date('2025-12-01T09:50:00Z'), end: new Date('2025-12-01T10:00:00Z') }];
    expect(bufferTimeConflicts(interval, blocked, { bufferBefore: 0, bufferAfter: 0 })).toBe(false);
  });

  test('returns false for blocked time abutting the buffers', () => {
    const blocked = [
      { start: new Date('2025-12-01T09:00:00Z'), end: new Date('2025-12-01T09:40:00Z') },
      { start: new Date('2025-12-01T11:20:00Z'), end: new Date('2025-12-01T12:00:00Z') },
    ];
    expect(bufferTimeConflicts(interval, blocked, buffers)).toBe(false);
  });

  test('returns false for blocked time overlapping only the appointment itself', () => {
    const blocked = [{ start: new Date('2025-12-01T10:00:00Z'), end: new Date('2025-12-01T11:00:00Z') }];
    expect(bufferTimeConflicts(interval, blocked, buffers)).toBe(false);
  });

  test('returns true when blocked time overlaps the buffer before', () => {
    const blocked = [{ start: new Date('2025-12-01T09:00:00Z'), end: new Date('2025-12-01T09:50:00Z') }];
    expect(bufferTimeConflicts(interval, blocked, buffers)).toBe(true);
    expect(bufferTimeConflicts(interval, blocked, { bufferBefore: 0, bufferAfter: 20 })).toBe(false);
  });

  test('returns true when blocked time overlaps the buffer after', () => {
    const blocked = [{ start: new Date('2025-12-01T11:10:00Z'), end: new Date('2025-12-01T12:00:00Z') }];
    expect(bufferTimeConflicts(interval, blocked, buffers)).toBe(true);
    expect(bufferTimeConflicts(interval, blocked, { bufferBefore: 20, bufferAfter: 0 })).toBe(false);
  });

  test('returns true when blocked time falls entirely inside a buffer', () => {
    const blocked = [{ start: new Date('2025-12-01T09:45:00Z'), end: new Date('2025-12-01T09:50:00Z') }];
    expect(bufferTimeConflicts(interval, blocked, buffers)).toBe(true);
  });
});
