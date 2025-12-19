// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { createReference, generateId } from '@medplum/core';
import type { Practitioner, Project, Schedule, Slot } from '@medplum/fhirtypes';
import type { Interval } from '../../../util/date';
import {
  applyExistingSlots,
  findAlignedSlotTimes,
  findSlotTimes,
  normalizeIntervals,
  removeAvailability,
  resolveAvailability,
} from './find';
import type { SchedulingParameters } from './scheduling-parameters';

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
      serviceTypes: [],
      wildcard: true,
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
      serviceTypes: [],
      wildcard: true,
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
      serviceTypes: [],
      wildcard: true,
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
      serviceTypes: [],
      wildcard: true,
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

  test('availability spanning a DST change', () => {
    const schedulingParameters: SchedulingParameters = {
      availability: [
        {
          dayOfWeek: ['sun'],
          timeOfDay: ['00:30:00'],
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

    // NY has a DST "spring forward" on March 8 2026
    const range = {
      start: new Date('2026-03-08T00:00:00.000-05:00'), // Sun Mar 8, 12am EST
      end: new Date('2026-03-08T08:00:00.000-04:00'), // Sun Mar 8, 8am EDT
    };

    // Availability duration is 6 hours, spanning 12:30am (pre time-change) to 7:30am (post time-change)
    expect(resolveAvailability(schedulingParameters, range, 'America/New_York')).toEqual([
      { start: new Date('2026-03-08T05:30:00.000Z'), end: new Date('2026-03-08T11:30:00.000Z') },
    ]);

    // NY has a DST "fall back" on Nov 2 2025
    const range2 = {
      start: new Date('2025-11-02T00:00:00.000-04:00'), // Sun Nov 2, 12am EDT
      end: new Date('2025-11-02T08:00:00.000-05:00'), // Sun Nov 2, 8am EST
    };

    // Availability duration is 6 hours, spanning 12:30am (pre time-change) to 7:30am (post time-change)
    expect(resolveAvailability(schedulingParameters, range2, 'America/New_York')).toEqual([
      { start: new Date('2025-11-02T04:30:00.000Z'), end: new Date('2025-11-02T10:30:00.000Z') },
    ]);
  });

  test('availability on an ambiguous DST fall back time chooses the earlier option', () => {
    const schedulingParameters: SchedulingParameters = {
      availability: [
        {
          dayOfWeek: ['sun'],
          timeOfDay: ['01:30:00'],
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

    // NY has a DST "fall back" on Nov 2 2025: 1:30am: happens twice
    const range = {
      start: new Date('2025-11-02T00:00:00.000-04:00'), // Sun Nov 2, 12am EDT
      end: new Date('2025-11-02T10:00:00.000-05:00'), // Sun Nov 2, 10am EST
    };

    // Availability duration is 6 hours, spanning 1:30am (post time-change) to 7:30am (post time-change)
    expect(resolveAvailability(schedulingParameters, range, 'America/New_York')).toEqual([
      { start: new Date('2025-11-02T05:30:00.000Z'), end: new Date('2025-11-02T11:30:00.000Z') },
    ]);
  });

  test('availability on an ambiguous DST spring forward time starts late', () => {
    const schedulingParameters: SchedulingParameters = {
      availability: [
        {
          dayOfWeek: ['sun'],
          timeOfDay: ['02:30:00'],
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

    // NY has a DST "spring forward" on March 8 2026; 2:30am never happens
    const range = {
      start: new Date('2026-03-08T00:00:00.000-05:00'), // Sun Mar 8, 12am EST
      end: new Date('2026-03-08T10:00:00.000-04:00'), // Sun Mar 8, 10am EDT
    };

    // Availability duration is 6 hours, spanning 03:30 (post time-change) to 09:30am (post time-change)
    expect(resolveAvailability(schedulingParameters, range, 'America/New_York')).toEqual([
      { start: new Date('2026-03-08T07:30:00.000Z'), end: new Date('2026-03-08T13:30:00.000Z') },
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

function makeSlots(schedule: Schedule, intervals: Interval[], status: Slot['status'] = 'busy'): Slot[] {
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
    expect(applyExistingSlots(availability, busySlots, range)).toEqual([
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

describe('findSlotTimes', () => {
  test('finds slots of the requested duration', () => {
    const schedulingParameters: SchedulingParameters = {
      availability: [],
      duration: 20,
      bufferBefore: 0,
      bufferAfter: 0,
      alignmentInterval: 60,
      alignmentOffset: 0,
      serviceTypes: [],
      wildcard: true,
    };
    const availability = [{ start: new Date('2025-12-01T12:00:00Z'), end: new Date('2025-12-01T15:00:00Z') }];
    expect(findSlotTimes(schedulingParameters, availability)).toEqual([
      { start: new Date('2025-12-01T12:00:00Z'), end: new Date('2025-12-01T12:20:00Z') },
      { start: new Date('2025-12-01T13:00:00Z'), end: new Date('2025-12-01T13:20:00Z') },
      { start: new Date('2025-12-01T14:00:00Z'), end: new Date('2025-12-01T14:20:00Z') },
    ]);
  });

  test('can offset alignment', () => {
    const schedulingParameters: SchedulingParameters = {
      availability: [],
      duration: 20,
      bufferBefore: 0,
      bufferAfter: 0,
      alignmentInterval: 30,
      alignmentOffset: 15,
      serviceTypes: [],
      wildcard: true,
    };
    const availability = [{ start: new Date('2025-12-01T12:00:00Z'), end: new Date('2025-12-01T15:00:00Z') }];
    expect(findSlotTimes(schedulingParameters, availability)).toEqual([
      { start: new Date('2025-12-01T12:15:00Z'), end: new Date('2025-12-01T12:35:00Z') },
      { start: new Date('2025-12-01T12:45:00Z'), end: new Date('2025-12-01T13:05:00Z') },
      { start: new Date('2025-12-01T13:15:00Z'), end: new Date('2025-12-01T13:35:00Z') },
      { start: new Date('2025-12-01T13:45:00Z'), end: new Date('2025-12-01T14:05:00Z') },
      { start: new Date('2025-12-01T14:15:00Z'), end: new Date('2025-12-01T14:35:00Z') },
    ]);
  });

  test('can require buffer time around the slot', () => {
    const schedulingParameters: SchedulingParameters = {
      availability: [],
      duration: 20,
      bufferBefore: 20,
      bufferAfter: 30,
      alignmentInterval: 30,
      alignmentOffset: 15,
      serviceTypes: [],
      wildcard: true,
    };
    const availability = [{ start: new Date('2025-12-01T12:00:00Z'), end: new Date('2025-12-01T15:00:00Z') }];
    expect(findSlotTimes(schedulingParameters, availability)).toEqual([
      // Slot from 12:15-12:35 not found because it doesn't have enough bufferBefore
      { start: new Date('2025-12-01T12:45:00Z'), end: new Date('2025-12-01T13:05:00Z') },
      { start: new Date('2025-12-01T13:15:00Z'), end: new Date('2025-12-01T13:35:00Z') },
      { start: new Date('2025-12-01T13:45:00Z'), end: new Date('2025-12-01T14:05:00Z') },
      // Slot from 14:15-14:35 not found because it doesn't have enough bufferAfter
    ]);
  });

  test('respects the maxCount option', () => {
    const schedulingParameters: SchedulingParameters = {
      availability: [],
      duration: 20,
      bufferBefore: 0,
      bufferAfter: 0,
      alignmentInterval: 30,
      alignmentOffset: 15,
      serviceTypes: [],
      wildcard: true,
    };
    const availability = [{ start: new Date('2025-12-01T12:00:00Z'), end: new Date('2025-12-01T15:00:00Z') }];
    expect(findSlotTimes(schedulingParameters, availability, { maxCount: 3 })).toEqual([
      { start: new Date('2025-12-01T12:15:00Z'), end: new Date('2025-12-01T12:35:00Z') },
      { start: new Date('2025-12-01T12:45:00Z'), end: new Date('2025-12-01T13:05:00Z') },
      { start: new Date('2025-12-01T13:15:00Z'), end: new Date('2025-12-01T13:35:00Z') },
    ]);
  });
});
