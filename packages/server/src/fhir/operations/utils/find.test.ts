// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { findAlignedSlotTimes, normalizeIntervals, removeAvailability, resolveAvailability } from './find';
import type { SchedulingParameters } from './scheduling-parameters';

describe('resolveAvailability', () => {
  test('having multiple days and times', async () => {
    const schedulingParameters: SchedulingParameters = {
      availability: [
        {
          dayOfWeek: ['mon', 'wed', 'thu'],
          timeOfDay: ['09:30:00', '13:15:00'],
          duration: 180,
        },
      ],
      duration: 20,
      bufferBefore: 0,
      bufferAfter: 0,
      alignmentInterval: 60,
      alignmentOffset: 0,
      serviceType: [],
    };

    const range = {
      start: new Date('2025-11-30T00:00:00.000-05:00'), // Start of Oct 30
      end: new Date('2025-12-03T23:59:59.999-05:00'), // End of Dec 3
    };
    expect(resolveAvailability(schedulingParameters, range, 'America/New_York')).toEqual([
      // Mon Dec 1: 9:30am ET - 12:30pm ET
      { start: new Date('2025-12-01T14:30:00.000Z'), end: new Date('2025-12-01T17:30:00.000Z') },
      // Mon Dec 1: 1:15pm ET - 4:15pm ET
      { start: new Date('2025-12-01T18:15:00.000Z'), end: new Date('2025-12-01T21:15:00.000Z') },
      // Wed Dec 3: 9:30am ET - 12:30pm ET
      { start: new Date('2025-12-03T14:30:00.000Z'), end: new Date('2025-12-03T17:30:00.000Z') },
      // Wed Dec 3: 1:15pm ET - 4:15pm ET
      { start: new Date('2025-12-03T18:15:00.000Z'), end: new Date('2025-12-03T21:15:00.000Z') },
    ]);
  });

  test('for an availability entry crossing midnight', () => {
    const schedulingParameters: SchedulingParameters = {
      availability: [
        {
          dayOfWeek: ['mon'],
          timeOfDay: ['15:20:00'],
          duration: 600,
        },
      ],
      duration: 20,
      bufferBefore: 0,
      bufferAfter: 0,
      alignmentInterval: 60,
      alignmentOffset: 0,
      serviceType: [],
    };

    const range = {
      start: new Date('2025-11-30T00:00:00.000-05:00'), // Start of Oct 30
      end: new Date('2025-12-03T23:59:59.999-05:00'), // End of Dec 3
    };

    expect(resolveAvailability(schedulingParameters, range, 'America/New_York')).toEqual([
      // Mon Dec 1, 3:20pm ET - Tue Dec 2, 1:20am ET
      { start: new Date('2025-12-01T20:20:00.000Z'), end: new Date('2025-12-02T06:20:00.000Z') },
    ]);
  });

  test('availabilities crossing the start of the query range are clamped', () => {
    const schedulingParameters: SchedulingParameters = {
      availability: [
        {
          dayOfWeek: ['tue'],
          timeOfDay: ['10:00:00'],
          duration: 360,
        },
      ],
      duration: 20,
      bufferBefore: 0,
      bufferAfter: 0,
      alignmentInterval: 60,
      alignmentOffset: 0,
      serviceType: [],
    };

    const range = {
      start: new Date('2025-12-02T12:00:00.000-05:00'), // Tue Oct 2, noon ET
      end: new Date('2025-12-02T22:00:00.000-05:00'), // Tue Oct 2, 10pm ET
    };

    expect(resolveAvailability(schedulingParameters, range, 'America/New_York')).toEqual([
      // Tue Dec 2, 12:00pm ET - Tue Dec 2, 4:00pm ET
      { start: new Date('2025-12-02T17:00:00.000Z'), end: new Date('2025-12-02T21:00:00.000Z') },
    ]);
  });

  test('availabilities crossing the end of the query range are clamped', () => {
    const schedulingParameters: SchedulingParameters = {
      availability: [
        {
          dayOfWeek: ['tue'],
          timeOfDay: ['10:00:00'],
          duration: 360,
        },
      ],
      duration: 20,
      bufferBefore: 0,
      bufferAfter: 0,
      alignmentInterval: 60,
      alignmentOffset: 0,
      serviceType: [],
    };

    const range = {
      start: new Date('2025-12-02T04:00:00.000-05:00'), // Tue Oct 2, 4am ET
      end: new Date('2025-12-02T14:30:00.000-05:00'), // Tue Oct 2, 2:30pm ET
    };

    expect(resolveAvailability(schedulingParameters, range, 'America/New_York')).toEqual([
      // Tue Dec 2, 10:00am ET - Tue Dec 2, 2:30pm ET
      { start: new Date('2025-12-02T15:00:00.000Z'), end: new Date('2025-12-02T19:30:00.000Z') },
    ]);
  });

  test('on days with DST transitions', () => {
    const schedulingParameters: SchedulingParameters = {
      availability: [
        {
          dayOfWeek: ['sun'],
          timeOfDay: ['10:00:00'],
          duration: 360,
        },
      ],
      duration: 20,
      bufferBefore: 0,
      bufferAfter: 0,
      alignmentInterval: 60,
      alignmentOffset: 0,
      serviceType: [],
    };

    // NY has a DST "spring forward" on March 8 2026
    const springRange = {
      start: new Date('2026-03-08T09:00:00.000-04:00'), // Sun Mar 8, 9am EDT
      end: new Date('2026-03-08T22:00:00.000-04:00'), // Sun Mar 8, 10pm EDT
    };

    expect(resolveAvailability(schedulingParameters, springRange, 'America/New_York')).toEqual([
      { start: new Date('2026-03-08T14:00:00.000Z'), end: new Date('2026-03-08T20:00:00.000Z') },
    ]);

    // NY has a DST "fall back" on Nov 2 2025
    const fallRange = {
      start: new Date('2025-11-02T09:00:00.000-05:00'), // Sun Nov 2, 9am EST
      end: new Date('2025-11-02T22:00:00.000-05:00'), // Sun Nov 2, 10pm EST
    };

    expect(resolveAvailability(schedulingParameters, fallRange, 'America/New_York')).toEqual([
      { start: new Date('2025-11-02T15:00:00.000Z'), end: new Date('2025-11-02T21:00:00.000Z') },
    ]);
  });
});

describe('normalizeIntervals', () => {
  test('it sorts the input intervals', () => {
    const intervals = [
      { start: new Date('2025-12-03'), end: new Date('2025-12-04') },
      { start: new Date('2025-12-01'), end: new Date('2025-12-02') },
      { start: new Date('2025-12-05'), end: new Date('2025-12-06') },
    ];

    expect(normalizeIntervals(intervals)).toEqual([
      { start: new Date('2025-12-01'), end: new Date('2025-12-02') },
      { start: new Date('2025-12-03'), end: new Date('2025-12-04') },
      { start: new Date('2025-12-05'), end: new Date('2025-12-06') },
    ]);
  });

  test('it merges overlapping intervals', () => {
    const intervals = [
      { start: new Date('2025-12-01'), end: new Date('2025-12-08') },
      { start: new Date('2025-12-03'), end: new Date('2025-12-04') },
      { start: new Date('2025-12-07'), end: new Date('2025-12-09') },
    ];

    expect(normalizeIntervals(intervals)).toEqual([{ start: new Date('2025-12-01'), end: new Date('2025-12-09') }]);
  });

  test('it merges intervals that share an endpoint', () => {
    const intervals = [
      { start: new Date('2025-12-01'), end: new Date('2025-12-03') },
      { start: new Date('2025-12-03'), end: new Date('2025-12-04') },
    ];

    expect(normalizeIntervals(intervals)).toEqual([{ start: new Date('2025-12-01'), end: new Date('2025-12-04') }]);
  });
});

describe('removeAvailability', () => {
  test('no blocks returns all the availability', () => {
    const availability = [
      { start: new Date('2025-12-01'), end: new Date('2025-12-02') },
      { start: new Date('2025-12-03'), end: new Date('2025-12-04') },
      { start: new Date('2025-12-05'), end: new Date('2025-12-06') },
    ];

    expect(removeAvailability(availability, [])).toEqual(availability);
  });

  test('no blocks overlapping returns all the availability', () => {
    const availability = [
      { start: new Date('2025-12-01'), end: new Date('2025-12-02') },
      { start: new Date('2025-12-03'), end: new Date('2025-12-04') },
      { start: new Date('2025-12-05'), end: new Date('2025-12-06') },
    ];

    const blocks = [{ start: new Date('2025-12-02T10:00:00Z'), end: new Date('2025-12-02T14:00:00Z') }];
    expect(removeAvailability(availability, blocks)).toEqual(availability);
  });

  test('Blocks in the middle of an availability window split it', () => {
    const availability = [{ start: new Date('2025-12-01T00:00:00Z'), end: new Date('2025-12-02T00:00:00Z') }];

    const blocks = [
      { start: new Date('2025-12-01T02:00:00Z'), end: new Date('2025-12-01T03:00:00Z') },
      { start: new Date('2025-12-01T06:00:00Z'), end: new Date('2025-12-01T09:00:00Z') },
      { start: new Date('2025-12-01T12:00:00Z'), end: new Date('2025-12-01T15:00:00Z') },
    ];
    expect(removeAvailability(availability, blocks)).toEqual([
      { start: new Date('2025-12-01T00:00:00Z'), end: new Date('2025-12-01T02:00:00Z') },
      { start: new Date('2025-12-01T03:00:00Z'), end: new Date('2025-12-01T06:00:00Z') },
      { start: new Date('2025-12-01T09:00:00Z'), end: new Date('2025-12-01T12:00:00Z') },
      { start: new Date('2025-12-01T15:00:00Z'), end: new Date('2025-12-02T00:00:00Z') },
    ]);
  });

  test('Blocks partially covering an availability window truncate it', () => {
    const availability = [{ start: new Date('2025-12-01T00:00:00Z'), end: new Date('2025-12-02T00:00:00Z') }];

    const blocks = [
      { start: new Date('2025-11-30T23:00:00Z'), end: new Date('2025-12-01T03:00:00Z') },
      { start: new Date('2025-12-01T23:00:00Z'), end: new Date('2025-12-02T03:00:00Z') },
    ];
    expect(removeAvailability(availability, blocks)).toEqual([
      { start: new Date('2025-12-01T03:00:00Z'), end: new Date('2025-12-01T23:00:00Z') },
    ]);
  });

  test('Exact overlaps remove matching availability intervals', () => {
    const availability = [
      { start: new Date('2025-12-01'), end: new Date('2025-12-02') },
      { start: new Date('2025-12-03'), end: new Date('2025-12-04') },
      { start: new Date('2025-12-05'), end: new Date('2025-12-06') },
    ];

    const blocks = [{ start: new Date('2025-12-03'), end: new Date('2025-12-04') }];
    expect(removeAvailability(availability, blocks)).toEqual([
      { start: new Date('2025-12-01'), end: new Date('2025-12-02') },
      { start: new Date('2025-12-05'), end: new Date('2025-12-06') },
    ]);
  });
});

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
});
