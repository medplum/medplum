// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { projectWeeksForward, recursWeekly, weekProjector } from './recurrence';

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

describe('weekProjector', () => {
  // Every 5 minutes, from a week before a transition to a week after.
  function anchorsAround(transition: string): Date[] {
    const start = Date.parse(transition) - 7 * 24 * 60 * 60 * 1000;
    return Array.from({ length: (14 * 24 * 60) / 5 }, (_, idx) => new Date(start + idx * 5 * 60 * 1000));
  }

  test.each([
    // US spring forward and fall back
    ['America/New_York', '2026-03-08T07:00:00Z'],
    ['America/New_York', '2026-11-01T06:00:00Z'],
    // A 30-minute DST shift
    ['Australia/Lord_Howe', '2026-04-04T15:00:00Z'],
    // Transitions at midnight, so some days start at 1am
    ['America/Havana', '2026-03-08T05:00:00Z'],
    // A 2-hour DST shift
    ['Antarctica/Troll', '2026-03-29T01:00:00Z'],
  ])('matches projectWeeksForward in %s around %s', (timezone, transition) => {
    const anchors = anchorsAround(transition);
    for (const weeksForward of [1, 2]) {
      const expected = anchors.map((anchor) => projectWeeksForward(anchor, weeksForward, timezone));
      expect(anchors.map(weekProjector(weeksForward, timezone))).toEqual(expected);
      // Out of order, too, if more slowly.
      const project = weekProjector(weeksForward, timezone);
      expect(anchors.toReversed().map((anchor) => project(anchor))).toEqual(expected.toReversed());
    }
  });
});

describe('recursWeekly', () => {
  test('rejects a series shifted by a DST gap', () => {
    // 2:15am EST, then 3:15am EDT: not the same local time.
    expect(recursWeekly(['2026-03-01T07:15:00.000Z', '2026-03-08T07:15:00.000Z'], 'America/New_York')).toBe(false);
  });
});
