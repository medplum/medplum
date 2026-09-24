// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { projectWeeksForward, recursWeekly } from './recurrence';

// US DST begins at 2am on Sunday 2026-03-08.
describe('projectWeeksForward', () => {
  test('keeps the wall-clock time across a DST transition', () => {
    // 9am EST, then 9am EDT.
    expect(projectWeeksForward(new Date('2026-03-01T14:00:00Z'), 1, 'America/New_York')).toEqual(
      new Date('2026-03-08T13:00:00Z')
    );
  });

  test('is undefined when the wall-clock time falls in a DST gap', () => {
    // 2:15am EST; 2:15am doesn't exist on 2026-03-08.
    expect(projectWeeksForward(new Date('2026-03-01T07:15:00Z'), 1, 'America/New_York')).toBeUndefined();
    // Past the gap, the same wall-clock time exists again.
    expect(projectWeeksForward(new Date('2026-03-01T07:15:00Z'), 2, 'America/New_York')).toEqual(
      new Date('2026-03-15T06:15:00Z')
    );
  });
});

describe('recursWeekly', () => {
  test('rejects a series shifted by a DST gap', () => {
    // 2:15am EST, then 3:15am EDT: not the same local time.
    expect(recursWeekly(['2026-03-01T07:15:00.000Z', '2026-03-08T07:15:00.000Z'], 'America/New_York')).toBe(false);
  });
});
