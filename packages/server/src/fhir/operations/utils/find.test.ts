// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { findAlignedSlotTimes } from './find';

describe('findAlignedSlotTimes', () => {
  test('can find a slot that exactly coincides with the interval', () => {
    const slots = findAlignedSlotTimes(
      { start: new Date('2025-12-01T00:00:00Z'), end: new Date('2025-12-01T01:00:00Z') },
      { alignment: 60, offsetMinutes: 0, durationMinutes: 60 }
    );
    expect(slots).toEqual([{ start: new Date('2025-12-01T00:00:00Z'), end: new Date('2025-12-01T01:00:00Z') }]);
  });

  test('returns empty when the interval is less than the duration', () => {
    const slots = findAlignedSlotTimes(
      { start: new Date('2025-12-01T00:00:00Z'), end: new Date('2025-12-01T01:00:00Z') },
      { alignment: 60, offsetMinutes: 0, durationMinutes: 90 }
    );
    expect(slots).toEqual([]);
  });

  test('it finds slots aligned to hours', () => {
    const slots = findAlignedSlotTimes(
      { start: new Date('2025-12-01T00:00:00Z'), end: new Date('2025-12-01T02:00:00Z') },
      { alignment: 60, offsetMinutes: 0, durationMinutes: 10 }
    );
    expect(slots).toEqual([
      { start: new Date('2025-12-01T00:00:00Z'), end: new Date('2025-12-01T00:10:00Z') },
      { start: new Date('2025-12-01T01:00:00Z'), end: new Date('2025-12-01T01:10:00Z') },
    ]);
  });

  test('it finds slots aligned to half hours', () => {
    const slots = findAlignedSlotTimes(
      { start: new Date('2025-12-01T00:00:00Z'), end: new Date('2025-12-01T02:00:00Z') },
      { alignment: 30, offsetMinutes: 0, durationMinutes: 10 }
    );
    expect(slots).toEqual([
      { start: new Date('2025-12-01T00:00:00Z'), end: new Date('2025-12-01T00:10:00Z') },
      { start: new Date('2025-12-01T00:30:00Z'), end: new Date('2025-12-01T00:40:00Z') },
      { start: new Date('2025-12-01T01:00:00Z'), end: new Date('2025-12-01T01:10:00Z') },
      { start: new Date('2025-12-01T01:30:00Z'), end: new Date('2025-12-01T01:40:00Z') },
    ]);
  });

  test('it finds slots aligned to quarter hours', () => {
    const slots = findAlignedSlotTimes(
      { start: new Date('2025-12-01T00:00:00Z'), end: new Date('2025-12-01T02:00:00Z') },
      { alignment: 15, offsetMinutes: 0, durationMinutes: 10 }
    );
    expect(slots).toEqual([
      { start: new Date('2025-12-01T00:00:00Z'), end: new Date('2025-12-01T00:10:00Z') },
      { start: new Date('2025-12-01T00:15:00Z'), end: new Date('2025-12-01T00:25:00Z') },
      { start: new Date('2025-12-01T00:30:00Z'), end: new Date('2025-12-01T00:40:00Z') },
      { start: new Date('2025-12-01T00:45:00Z'), end: new Date('2025-12-01T00:55:00Z') },
      { start: new Date('2025-12-01T01:00:00Z'), end: new Date('2025-12-01T01:10:00Z') },
      { start: new Date('2025-12-01T01:15:00Z'), end: new Date('2025-12-01T01:25:00Z') },
      { start: new Date('2025-12-01T01:30:00Z'), end: new Date('2025-12-01T01:40:00Z') },
      { start: new Date('2025-12-01T01:45:00Z'), end: new Date('2025-12-01T01:55:00Z') },
    ]);
  });

  test('it finds slots aligned to ten minute marks', () => {
    const slots = findAlignedSlotTimes(
      { start: new Date('2025-12-01T00:00:00Z'), end: new Date('2025-12-01T02:00:00Z') },
      { alignment: 10, offsetMinutes: 0, durationMinutes: 10 }
    );
    expect(slots).toEqual([
      { start: new Date('2025-12-01T00:00:00Z'), end: new Date('2025-12-01T00:10:00Z') },
      { start: new Date('2025-12-01T00:10:00Z'), end: new Date('2025-12-01T00:20:00Z') },
      { start: new Date('2025-12-01T00:20:00Z'), end: new Date('2025-12-01T00:30:00Z') },
      { start: new Date('2025-12-01T00:30:00Z'), end: new Date('2025-12-01T00:40:00Z') },
      { start: new Date('2025-12-01T00:40:00Z'), end: new Date('2025-12-01T00:50:00Z') },
      { start: new Date('2025-12-01T00:50:00Z'), end: new Date('2025-12-01T01:00:00Z') },
      { start: new Date('2025-12-01T01:00:00Z'), end: new Date('2025-12-01T01:10:00Z') },
      { start: new Date('2025-12-01T01:10:00Z'), end: new Date('2025-12-01T01:20:00Z') },
      { start: new Date('2025-12-01T01:20:00Z'), end: new Date('2025-12-01T01:30:00Z') },
      { start: new Date('2025-12-01T01:30:00Z'), end: new Date('2025-12-01T01:40:00Z') },
      { start: new Date('2025-12-01T01:40:00Z'), end: new Date('2025-12-01T01:50:00Z') },
      { start: new Date('2025-12-01T01:50:00Z'), end: new Date('2025-12-01T02:00:00Z') },
    ]);
  });

  test('offsetting alignment by five minutes', () => {
    const slots = findAlignedSlotTimes(
      { start: new Date('2025-12-01T00:00:00Z'), end: new Date('2025-12-01T02:00:00Z') },
      { alignment: 15, offsetMinutes: 5, durationMinutes: 10 }
    );
    expect(slots).toEqual([
      { start: new Date('2025-12-01T00:05:00Z'), end: new Date('2025-12-01T00:15:00Z') },
      { start: new Date('2025-12-01T00:20:00Z'), end: new Date('2025-12-01T00:30:00Z') },
      { start: new Date('2025-12-01T00:35:00Z'), end: new Date('2025-12-01T00:45:00Z') },
      { start: new Date('2025-12-01T00:50:00Z'), end: new Date('2025-12-01T01:00:00Z') },
      { start: new Date('2025-12-01T01:05:00Z'), end: new Date('2025-12-01T01:15:00Z') },
      { start: new Date('2025-12-01T01:20:00Z'), end: new Date('2025-12-01T01:30:00Z') },
      { start: new Date('2025-12-01T01:35:00Z'), end: new Date('2025-12-01T01:45:00Z') },
      { start: new Date('2025-12-01T01:50:00Z'), end: new Date('2025-12-01T02:00:00Z') },
    ]);
  });

  test('offsetting alignment by 20 minutes', () => {
    const slots = findAlignedSlotTimes(
      { start: new Date('2025-12-01T00:00:00Z'), end: new Date('2025-12-01T02:00:00Z') },
      { alignment: 30, offsetMinutes: 20, durationMinutes: 10 }
    );
    expect(slots).toEqual([
      { start: new Date('2025-12-01T00:20:00Z'), end: new Date('2025-12-01T00:30:00Z') },
      { start: new Date('2025-12-01T00:50:00Z'), end: new Date('2025-12-01T01:00:00Z') },
      { start: new Date('2025-12-01T01:20:00Z'), end: new Date('2025-12-01T01:30:00Z') },
      { start: new Date('2025-12-01T01:50:00Z'), end: new Date('2025-12-01T02:00:00Z') },
    ]);
  });

  test('offsetting alignment by a negative number', () => {
    // While we don't expect users to offset by a negative number, doing so can be helpful
    // for situations like "bufferBefore", where we want to check that availability starts
    // some time before the resulting slot start time.
    const slots = findAlignedSlotTimes(
      { start: new Date('2025-12-01T00:00:00Z'), end: new Date('2025-12-01T02:00:00Z') },
      { alignment: 30, offsetMinutes: -20, durationMinutes: 10 }
    );
    expect(slots).toEqual([
      { start: new Date('2025-12-01T00:10:00Z'), end: new Date('2025-12-01T00:20:00Z') },
      { start: new Date('2025-12-01T00:40:00Z'), end: new Date('2025-12-01T00:50:00Z') },
      { start: new Date('2025-12-01T01:10:00Z'), end: new Date('2025-12-01T01:20:00Z') },
      { start: new Date('2025-12-01T01:40:00Z'), end: new Date('2025-12-01T01:50:00Z') },
    ]);
  });

  test('slot alignment by values that do not evenly divide an hour', () => {
    // Slots are aligned to a fifty-minute grid. The first slot is found at `00:00`.
    const slots50Midnight = findAlignedSlotTimes(
      { start: new Date('2025-12-01T00:00:00Z'), end: new Date('2025-12-01T03:00:00Z') },
      { alignment: 50, offsetMinutes: 0, durationMinutes: 10 }
    );
    expect(slots50Midnight).toEqual([
      { start: new Date('2025-12-01T00:00:00Z'), end: new Date('2025-12-01T00:10:00Z') },
      { start: new Date('2025-12-01T00:50:00Z'), end: new Date('2025-12-01T01:00:00Z') },
      { start: new Date('2025-12-01T01:40:00Z'), end: new Date('2025-12-01T01:50:00Z') },
      { start: new Date('2025-12-01T02:30:00Z'), end: new Date('2025-12-01T02:40:00Z') },
    ]);

    // When searching does not start at midnight, we still find slots aligned
    // to the same fifty-minute grid.
    const slots50Later = findAlignedSlotTimes(
      { start: new Date('2025-12-01T01:00:00Z'), end: new Date('2025-12-01T03:00:00Z') },
      { alignment: 50, offsetMinutes: 0, durationMinutes: 10 }
    );
    expect(slots50Later).toEqual([
      { start: new Date('2025-12-01T01:40:00Z'), end: new Date('2025-12-01T01:50:00Z') },
      { start: new Date('2025-12-01T02:30:00Z'), end: new Date('2025-12-01T02:40:00Z') },
    ]);
  });

  test('re-anchors the UTC grid at each UTC midnight for multi-day intervals', () => {
    // Without re-anchoring, a 50-min grid starting on Dec 1 would place Dec 2
    // slots at 00:10 and 01:00 — 10 minutes off Dec 2's midnight-anchored grid.
    // Re-anchoring from Dec 2 midnight gives 00:00, 00:50, 01:40 (all 0 mod 50).
    const slots = findAlignedSlotTimes(
      { start: new Date('2025-12-01T23:10:00Z'), end: new Date('2025-12-02T01:50:00Z') },
      { alignment: 50, offsetMinutes: 0, durationMinutes: 10 }
    );
    expect(slots).toEqual([
      { start: new Date('2025-12-01T23:20:00Z'), end: new Date('2025-12-01T23:30:00Z') },
      { start: new Date('2025-12-02T00:00:00Z'), end: new Date('2025-12-02T00:10:00Z') },
      { start: new Date('2025-12-02T00:50:00Z'), end: new Date('2025-12-02T01:00:00Z') },
      { start: new Date('2025-12-02T01:40:00Z'), end: new Date('2025-12-02T01:50:00Z') },
    ]);
  });

  test('re-anchors the local grid at each local midnight for multi-day timezone intervals', () => {
    // America/New_York in December is EST (UTC-5); local midnight = 05:00 UTC.
    // Interval: 23:10 EST Dec 1 to 02:00 EST Dec 2 (= 04:10 UTC to 07:00 UTC).
    // Re-anchoring from local midnight gives 00:00, 00:50, 01:40 EST on Dec 2.
    const slots = findAlignedSlotTimes(
      { start: new Date('2025-12-02T04:10:00Z'), end: new Date('2025-12-02T07:00:00Z') },
      { alignment: 50, offsetMinutes: 0, durationMinutes: 10, timezone: 'America/New_York' }
    );
    expect(slots).toEqual([
      // 23:20 EST Dec 1 — on Dec 1's grid (1400 min, 1400 % 50 = 0)
      { start: new Date('2025-12-02T04:20:00Z'), end: new Date('2025-12-02T04:30:00Z') },
      // 00:00 EST Dec 2 — first slot of re-anchored Dec 2 grid (0 % 50 = 0)
      { start: new Date('2025-12-02T05:00:00Z'), end: new Date('2025-12-02T05:10:00Z') },
      // 00:50 EST Dec 2 (50 % 50 = 0)
      { start: new Date('2025-12-02T05:50:00Z'), end: new Date('2025-12-02T06:00:00Z') },
      // 01:40 EST Dec 2 (100 % 50 = 0)
      { start: new Date('2025-12-02T06:40:00Z'), end: new Date('2025-12-02T06:50:00Z') },
    ]);
  });

  test('timezone option anchors the grid to local midnight, not UTC midnight', () => {
    // Asia/Kolkata is UTC+5:30. Its 330-minute offset is not divisible by 50,
    // so UTC and local midnight anchoring diverge here.
    // 2025-11-30T18:30:00Z = midnight in Kolkata; 2025-11-30T21:30:00Z = 3am Kolkata.
    const slots = findAlignedSlotTimes(
      { start: new Date('2025-11-30T18:30:00Z'), end: new Date('2025-11-30T21:30:00Z') },
      { alignment: 50, offsetMinutes: 0, durationMinutes: 10, timezone: 'Asia/Kolkata' }
    );
    // Grid anchored to local midnight (18:30 UTC): 18:30, 19:20, 20:10, 21:00 UTC
    // = 00:00, 00:50, 01:40, 02:30 Kolkata
    expect(slots).toEqual([
      { start: new Date('2025-11-30T18:30:00Z'), end: new Date('2025-11-30T18:40:00Z') },
      { start: new Date('2025-11-30T19:20:00Z'), end: new Date('2025-11-30T19:30:00Z') },
      { start: new Date('2025-11-30T20:10:00Z'), end: new Date('2025-11-30T20:20:00Z') },
      { start: new Date('2025-11-30T21:00:00Z'), end: new Date('2025-11-30T21:10:00Z') },
    ]);
  });

  test('uneven slots crossing alignment grid thresholds', () => {
    // When slots are not evenly divisible by 1day, they introduce an inconsistency in the grid.
    // In this example, we have `alignment=50`, which does not evenly slice a 1440 minute day.
    //
    // There are several options:
    // 1. Don't allow booking the slot that crosses over the end of the grid.
    //    This leaves some time at the end of each day permanently unbookable.
    //
    // 2. Allow booking that slot, which can result in blocking normally available
    //    slots in the next day's grid.
    //
    // 3. Change the anchoring strategy so that the grid is weekly. This reduces
    //    the frequency of unbookable times, but means that you lose daily
    //    consistency in scheduling.
    //
    // Each of these choices is defensible. We choose option 2 as what we feel
    // is the best compromise.
    //
    // As a side effect, this means we tend to handle DST transition days well
    // - these days may be 23 or 25 hours long (and so are not evenly divisible
    // by as many common factors as your average day). Under this strategy we
    // fill up the day and allow slots to extend over the boundary into the
    // following day, potentially overlapping the grid.
    const slots = findAlignedSlotTimes(
      { start: new Date('2025-12-01T23:00:00Z'), end: new Date('2025-12-02T01:00:00Z') },
      { alignment: 50, offsetMinutes: 0, durationMinutes: 50 }
    );
    expect(slots).toEqual([
      // This slot at the end of Dec 1 is found, even though it extends outside the Dec 1
      // grid and booking it would collide with the following slot.
      { start: new Date('2025-12-01T23:20:00Z'), end: new Date('2025-12-02T00:10:00Z') },

      // This slot is aligned to the start of the Dec 2 grid, even though booking it
      // would collide with the previous slot.
      { start: new Date('2025-12-02T00:00:00Z'), end: new Date('2025-12-02T00:50:00Z') },
    ]);
  });

  test('DST: slot times stay consistent in local time across a DST boundary', () => {
    // America/Chicago is CST (UTC-6) in winter and CDT (UTC-5) in summer.
    // alignment=50 with UTC anchoring gives different local start times in each
    // season; timezone anchoring keeps them the same.
    const opts = { alignment: 50, offsetMinutes: 0, durationMinutes: 10, timezone: 'America/Chicago' };

    // Winter (CST, UTC-6): 08:00–10:00 UTC = 02:00–04:00 CST
    const winterSlots = findAlignedSlotTimes(
      { start: new Date('2025-12-01T08:00:00Z'), end: new Date('2025-12-01T10:00:00Z') },
      opts
    );
    // Summer (CDT, UTC-5): 07:00–09:00 UTC = 02:00–04:00 CDT (same local window)
    const summerSlots = findAlignedSlotTimes(
      { start: new Date('2025-06-01T07:00:00Z'), end: new Date('2025-06-01T09:00:00Z') },
      opts
    );

    // Both should find slots at 02:30 and 03:20 local time — just different UTC representations.
    expect(winterSlots).toEqual([
      { start: new Date('2025-12-01T08:30:00Z'), end: new Date('2025-12-01T08:40:00Z') },
      { start: new Date('2025-12-01T09:20:00Z'), end: new Date('2025-12-01T09:30:00Z') },
    ]);
    expect(summerSlots).toEqual([
      { start: new Date('2025-06-01T07:30:00Z'), end: new Date('2025-06-01T07:40:00Z') },
      { start: new Date('2025-06-01T08:20:00Z'), end: new Date('2025-06-01T08:30:00Z') },
    ]);
  });

  test('errors when alignment is zero', () => {
    expect(() => {
      findAlignedSlotTimes(
        { start: new Date('2025-12-01'), end: new Date('2025-12-08') },
        { alignment: 0, offsetMinutes: 0, durationMinutes: 10 }
      );
    }).toThrow('Invalid alignment');
  });

  test('maxCount option is respected', () => {
    const slots = findAlignedSlotTimes(
      { start: new Date('2025-12-01T00:00:00Z'), end: new Date('2025-12-01T02:00:00Z') },
      { alignment: 15, offsetMinutes: 0, durationMinutes: 10, maxCount: 5 }
    );
    expect(slots).toEqual([
      { start: new Date('2025-12-01T00:00:00Z'), end: new Date('2025-12-01T00:10:00Z') },
      { start: new Date('2025-12-01T00:15:00Z'), end: new Date('2025-12-01T00:25:00Z') },
      { start: new Date('2025-12-01T00:30:00Z'), end: new Date('2025-12-01T00:40:00Z') },
      { start: new Date('2025-12-01T00:45:00Z'), end: new Date('2025-12-01T00:55:00Z') },
      { start: new Date('2025-12-01T01:00:00Z'), end: new Date('2025-12-01T01:10:00Z') },
    ]);
  });
});
