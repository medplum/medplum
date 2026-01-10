// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { addMinutes, areIntervalsOverlapping, clamp } from './date';

describe('addMinutes', () => {
  test('adds the given number of minutes', () => {
    const date = new Date('2026-01-10T12:00:00Z');
    expect(addMinutes(date, 30)).toEqual(new Date('2026-01-10T12:30:00Z'));
  });

  test('does not mutate the input date', () => {
    const date = new Date('2026-01-10T12:00:00Z');
    addMinutes(date, 30);
    expect(date).toEqual(new Date('2026-01-10T12:00:00Z'));
  });
});

describe('areIntervalsOverlapping', () => {
  test('returns true when intervals overlap', () => {
    const left = {
      start: new Date('2026-01-10'),
      end: new Date('2026-01-20'),
    };
    const right = {
      start: new Date('2026-01-15'),
      end: new Date('2026-01-25'),
    };
    expect(areIntervalsOverlapping(left, right)).toBe(true);
  });

  test('returns true when one interval contains the other', () => {
    const left = {
      start: new Date('2026-01-10'),
      end: new Date('2026-01-30'),
    };
    const right = {
      start: new Date('2026-01-15'),
      end: new Date('2026-01-20'),
    };
    expect(areIntervalsOverlapping(left, right)).toBe(true);
  });

  test('returns true when intervals are identical', () => {
    const left = {
      start: new Date('2026-01-10'),
      end: new Date('2026-01-20'),
    };
    const right = {
      start: new Date('2026-01-10'),
      end: new Date('2026-01-20'),
    };
    expect(areIntervalsOverlapping(left, right)).toBe(true);
  });

  test('returns false when intervals do not overlap', () => {
    const left = {
      start: new Date('2026-01-10'),
      end: new Date('2026-01-15'),
    };
    const right = {
      start: new Date('2026-01-20'),
      end: new Date('2026-01-25'),
    };
    expect(areIntervalsOverlapping(left, right)).toBe(false);
  });

  test('returns false when intervals are adjacent (non-inclusive)', () => {
    const left = {
      start: new Date('2026-01-10'),
      end: new Date('2026-01-15'),
    };
    const right = {
      start: new Date('2026-01-15'),
      end: new Date('2026-01-20'),
    };
    expect(areIntervalsOverlapping(left, right)).toBe(false);
  });

  test('returns true when intervals are adjacent (inclusive)', () => {
    const left = {
      start: new Date('2026-01-10'),
      end: new Date('2026-01-15'),
    };
    const right = {
      start: new Date('2026-01-15'),
      end: new Date('2026-01-20'),
    };
    expect(areIntervalsOverlapping(left, right, { inclusive: true })).toBe(true);
  });

  test('returns false when intervals do not overlap (inclusive)', () => {
    const left = {
      start: new Date('2026-01-10'),
      end: new Date('2026-01-14'),
    };
    const right = {
      start: new Date('2026-01-15'),
      end: new Date('2026-01-20'),
    };
    expect(areIntervalsOverlapping(left, right, { inclusive: true })).toBe(false);
  });

  test('is symmetric - order of intervals does not matter', () => {
    const left = {
      start: new Date('2026-01-10'),
      end: new Date('2026-01-20'),
    };
    const right = {
      start: new Date('2026-01-15'),
      end: new Date('2026-01-25'),
    };
    expect(areIntervalsOverlapping(left, right)).toBe(areIntervalsOverlapping(right, left));
  });
});

describe('clamp', () => {
  test('clamps early dates to the start of the interval', () => {
    const date = new Date('2026-01-10');
    const interval = {
      start: new Date('2026-01-15'),
      end: new Date('2026-01-21'),
    };
    expect(clamp(date, interval)).toEqual(interval.start);
  });

  test('clamps late dates to the end of the interval', () => {
    const date = new Date('2026-01-25');
    const interval = {
      start: new Date('2026-01-15'),
      end: new Date('2026-01-21'),
    };
    expect(clamp(date, interval)).toEqual(interval.end);
  });

  test('returns the date when it is in the interval', () => {
    const date = new Date('2026-01-18');
    const interval = {
      start: new Date('2026-01-15'),
      end: new Date('2026-01-21'),
    };
    expect(clamp(date, interval)).toEqual(date);
  });
});
