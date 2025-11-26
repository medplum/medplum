// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { tz, TZDate } from '@date-fns/tz';
import { createReference, generateId } from '@medplum/core';
import type { Practitioner, Project, Schedule, Slot } from '@medplum/fhirtypes';
import type { Interval } from 'date-fns';
import {
  applyExistingSlots,
  findAlignedSlots,
  normalizeIntervals,
  removeAvailability,
  resolveAvailability,
} from './find';
import type { SchedulingParameters } from './scheduling-parameters';

const tzny = tz('America/New_York');

const project: Project = {
  resourceType: 'Project',
  id: generateId(),
};

const practitioner: Practitioner = {
  resourceType: 'Practitioner',
  id: generateId(),
  meta: { project: project.id },
};

const schedule: Schedule = {
  resourceType: 'Schedule',
  id: generateId(),
  meta: { project: project.id },
  actor: [createReference(practitioner)],
};

// Jest matchers don't show a good diff when comparing Date and TZDate instances.
// Converting results to UTC and stripping timezone info makes debugging easier.
function coerceToRaw(intervals: Interval[]): Interval[] {
  return intervals.map(({ start, end }) => ({ start: new Date(start), end: new Date(end) }));
}

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
      serviceTypes: [],
      wildcard: true,
    };

    const range = {
      start: new TZDate('2025-11-30T00:00:00.000-05:00', 'America/New_York'), // Start of Oct 30
      end: new TZDate('2025-12-03T23:59:59.999-05:00', 'America/New_York'), // End of Dec 3
    };
    expect(coerceToRaw(resolveAvailability(schedulingParameters, range, { in: tzny }))).toEqual([
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
      serviceTypes: [],
      wildcard: true,
    };

    const range = {
      start: new TZDate('2025-11-30T00:00:00.000-05:00', 'America/New_York'), // Start of Oct 30
      end: new TZDate('2025-12-03T23:59:59.999-05:00', 'America/New_York'), // End of Dec 3
    };

    expect(coerceToRaw(resolveAvailability(schedulingParameters, range, { in: tzny }))).toEqual([
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
      serviceTypes: [],
      wildcard: true,
    };

    const range = {
      start: new TZDate('2025-12-02T12:00:00.000-05:00', 'America/New_York'), // Tue Oct 2, noon ET
      end: new TZDate('2025-12-02T22:00:00.000-05:00', 'America/New_York'), // Tue Oct 2, 10pm ET
    };

    expect(coerceToRaw(resolveAvailability(schedulingParameters, range))).toEqual([
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
      serviceTypes: [],
      wildcard: true,
    };

    const range = {
      start: new TZDate('2025-12-02T04:00:00.000-05:00', 'America/New_York'), // Tue Oct 2, 4am ET
      end: new TZDate('2025-12-02T14:30:00.000-05:00', 'America/New_York'), // Tue Oct 2, 2:30pm ET
    };

    expect(coerceToRaw(resolveAvailability(schedulingParameters, range))).toEqual([
      // Tue Dec 2, 10:00am ET - Tue Dec 2, 2:30pm ET
      { start: new Date('2025-12-02T15:00:00.000Z'), end: new Date('2025-12-02T19:30:00.000Z') },
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

function makeSlots(schedule: Schedule, intervals: Interval<Date, Date>[], status: Slot['status'] = 'busy'): Slot[] {
  return intervals.map((interval) => ({
    resourceType: 'Slot',
    schedule: { reference: `Schedule/${schedule.id}` },
    status,
    start: interval.start.toISOString(),
    end: interval.end.toISOString(),
  }));
}

describe('applyExistingSlots', () => {
  test('with no availability or free slots', () => {
    const range = { start: new Date('2025-12-01'), end: new Date('2025-12-30') };
    expect(applyExistingSlots([], [], range)).toEqual([]);
  });

  test('returns the input availability when no slot overrides exist', () => {
    const availability = [
      { start: new Date('2025-12-01'), end: new Date('2025-12-02') },
      { start: new Date('2025-12-03'), end: new Date('2025-12-04') },
      { start: new Date('2025-12-05'), end: new Date('2025-12-06') },
    ];
    const range = { start: new Date('2025-12-01'), end: new Date('2025-12-30') };
    expect(applyExistingSlots(availability, [], range)).toEqual(availability);
  });

  test('returns free slots as available time', () => {
    const freeIntervals = [{ start: new Date('2025-12-01T10:00:00.000Z'), end: new Date('2025-12-01T14:00:00.000Z') }];
    const freeSlots = makeSlots(schedule, freeIntervals, 'free');
    const range = { start: new Date('2025-12-01'), end: new Date('2025-12-30') };
    expect(applyExistingSlots([], freeSlots, range)).toEqual(freeIntervals);
  });

  test('free slots wider than the queried range are truncated', () => {
    const freeIntervals = [{ start: new Date('2025-12-01'), end: new Date('2025-12-07') }];
    const freeSlots = makeSlots(schedule, freeIntervals, 'free');
    const range = { start: new Date('2025-12-02'), end: new Date('2025-12-04') };
    expect(applyExistingSlots([], freeSlots, range)).toEqual([range]);
  });

  test('it removes busy slots from the availability', () => {
    const availability = [
      { start: new Date('2025-12-01T12:00:00-05:00'), end: new Date('2025-12-01T16:00:00-05:00') },
      { start: new Date('2025-12-03T12:00:00-05:00'), end: new Date('2025-12-03T16:00:00-05:00') },
    ];
    const busyIntervals = [
      { start: new Date('2025-12-01T10:00:00-05:00'), end: new Date('2025-12-01T14:00:00-05:00') },
    ];
    const busySlots = makeSlots(schedule, busyIntervals, 'busy');
    const range = { start: new Date('2025-12-01'), end: new Date('2025-12-30') };
    expect(applyExistingSlots(availability, busySlots, range, { in: tzny })).toEqual([
      { start: new Date('2025-12-01T14:00:00-05:00'), end: new Date('2025-12-01T16:00:00-05:00') },
      { start: new Date('2025-12-03T12:00:00-05:00'), end: new Date('2025-12-03T16:00:00-05:00') },
    ]);
  });

  test('it removes busy-unavailable slots from the availability', () => {
    const availability = [
      { start: new Date('2025-12-01T12:00:00-05:00'), end: new Date('2025-12-01T16:00:00-05:00') },
      { start: new Date('2025-12-03T12:00:00-05:00'), end: new Date('2025-12-03T16:00:00-05:00') },
    ];
    const busyUnavailableIntervals = [
      { start: new Date('2025-12-01T10:00:00-05:00'), end: new Date('2025-12-01T14:00:00-05:00') },
    ];
    const slots = makeSlots(schedule, busyUnavailableIntervals, 'busy-unavailable');
    const range = { start: new Date('2025-12-01'), end: new Date('2025-12-30') };
    expect(applyExistingSlots(availability, slots, range)).toEqual([
      { start: new Date('2025-12-01T14:00:00-05:00'), end: new Date('2025-12-01T16:00:00-05:00') },
      { start: new Date('2025-12-03T12:00:00-05:00'), end: new Date('2025-12-03T16:00:00-05:00') },
    ]);
  });

  test('busy slots override free slots', () => {
    const availability = [
      { start: new Date('2025-12-01T12:00:00-05:00'), end: new Date('2025-12-01T16:00:00-05:00') },
      { start: new Date('2025-12-03T12:00:00-05:00'), end: new Date('2025-12-03T16:00:00-05:00') },
    ];
    const busyIntervals = [
      { start: new Date('2025-12-01T10:00:00-05:00'), end: new Date('2025-12-01T14:00:00-05:00') },
    ];
    const freeIntervals = [
      { start: new Date('2025-12-01T10:00:00-05:00'), end: new Date('2025-12-01T14:00:00-05:00') },
    ];
    const busySlots = makeSlots(schedule, busyIntervals, 'busy');
    const freeSlots = makeSlots(schedule, freeIntervals, 'free');
    const slots = [...busySlots, ...freeSlots];
    const range = { start: new Date('2025-12-01'), end: new Date('2025-12-30') };
    expect(applyExistingSlots(availability, slots, range)).toEqual([
      { start: new Date('2025-12-01T14:00:00-05:00'), end: new Date('2025-12-01T16:00:00-05:00') },
      { start: new Date('2025-12-03T12:00:00-05:00'), end: new Date('2025-12-03T16:00:00-05:00') },
    ]);
  });
});

describe('findAlignedSlots', () => {
  test('can find a slot that exactly coincides with the interval', () => {
    const slots = findAlignedSlots(
      { start: new Date('2025-12-01T00:00:00Z'), end: new Date('2025-12-01T01:00:00Z') },
      { alignment: 60, offsetMinutes: 0, durationMinutes: 60 }
    );
    expect(slots).toEqual([{ start: new Date('2025-12-01T00:00:00Z'), end: new Date('2025-12-01T01:00:00Z') }]);
  });

  test('returns empty when the interval is less than the duration', () => {
    const slots = findAlignedSlots(
      { start: new Date('2025-12-01T00:00:00Z'), end: new Date('2025-12-01T01:00:00Z') },
      { alignment: 60, offsetMinutes: 0, durationMinutes: 90 }
    );
    expect(slots).toEqual([]);
  });

  test('it finds slots aligned to hours', () => {
    const slots = findAlignedSlots(
      { start: new Date('2025-12-01T00:00:00Z'), end: new Date('2025-12-01T02:00:00Z') },
      { alignment: 60, offsetMinutes: 0, durationMinutes: 10 }
    );
    expect(slots).toEqual([
      { start: new Date('2025-12-01T00:00:00Z'), end: new Date('2025-12-01T00:10:00Z') },
      { start: new Date('2025-12-01T01:00:00Z'), end: new Date('2025-12-01T01:10:00Z') },
    ]);
  });

  test('it finds slots aligned to half hours', () => {
    const slots = findAlignedSlots(
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
    const slots = findAlignedSlots(
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
    const slots = findAlignedSlots(
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
    const slots = findAlignedSlots(
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
    const slots = findAlignedSlots(
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
    const slots = findAlignedSlots(
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
