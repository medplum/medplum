// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getFindWindow } from './AppointmentFinder.find';
import { MAX_FIND_WINDOW_DAYS } from './AppointmentFinder.times';

describe('getFindWindow', () => {
  const NOON = new Date(2026, 6, 27, 12, 0);

  test('Opens at the requested time and runs to the end of a later day', () => {
    const window = getFindWindow(NOON, undefined, 0, 14);

    expect(window?.start).toStrictEqual(NOON);
    // July 27 through August 9 is a fortnight, counting the day it starts on.
    expect(window?.end).toStrictEqual(new Date(2026, 7, 9, 23, 59, 59, 999));
  });

  test('Picks up each later page where the one before it left off', () => {
    const first = getFindWindow(NOON, undefined, 0, 14);
    const second = getFindWindow(NOON, undefined, 1, 14);
    const third = getFindWindow(NOON, undefined, 2, 14);

    expect(second?.start).toStrictEqual(first?.end);
    expect(second?.end).toStrictEqual(new Date(2026, 7, 23, 23, 59, 59, 999));
    expect(third?.start).toStrictEqual(second?.end);
  });

  test('Stops at the end of the range that was asked for', () => {
    const end = new Date(2026, 6, 31, 23, 59, 59, 999);

    expect(getFindWindow(NOON, end, 0, 14)).toStrictEqual({ start: NOON, end });
    expect(getFindWindow(NOON, end, 1, 14)).toBeUndefined();
  });

  test('Walks a range longer than one request may cover', () => {
    const end = new Date(2026, 8, 30, 23, 59, 59, 999);

    expect(getFindWindow(NOON, end, 0, 14)?.end).toStrictEqual(new Date(2026, 7, 9, 23, 59, 59, 999));
    expect(getFindWindow(NOON, end, 4, 14)?.end).toStrictEqual(end);
    expect(getFindWindow(NOON, end, 5, 14)).toBeUndefined();
  });

  test('Keeps every page inside what the operation accepts', () => {
    for (const index of [0, 1, 2]) {
      const window = getFindWindow(NOON, undefined, index, 90);
      const days = ((window?.end.getTime() as number) - (window?.start.getTime() as number)) / (24 * 60 * 60 * 1000);
      expect(days).toBeLessThanOrEqual(MAX_FIND_WINDOW_DAYS);
    }
  });

  test('Reports that a range running backwards has nothing to search', () => {
    expect(getFindWindow(NOON, new Date(2026, 6, 1), 0)).toBeUndefined();
    expect(getFindWindow(NOON, NOON, 0)).toBeUndefined();
  });
});
