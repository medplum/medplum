// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, generateId } from '@medplum/core';
import type { Practitioner, Project, Schedule, Slot } from '@medplum/fhirtypes';
import type { Interval } from '../../../util/date';
import { applyExistingSlots, normalizeIntervals, removeAvailability, resolveAvailability } from './scheduling';
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

  // regression test for https://github.com/medplum/medplum/issues/8417
  test('when the request starts early in a UTC day', () => {
    const schedulingParameters: SchedulingParameters = {
      availability: [
        {
          dayOfWeek: ['tue', 'wed', 'thu'],
          timeOfDay: ['20:00:00'],
          duration: 360,
        },
      ],
      duration: 60,
      bufferBefore: 0,
      bufferAfter: 0,
      alignmentInterval: 60,
      alignmentOffset: 0,
      serviceType: [],
    };

    const range = {
      start: new Date('2026-01-14T19:00:00.000-05:00'), // Wed Jan 14, 7pm ET (which is Jan 15, 12am UTC)
      end: new Date('2026-01-15T05:00:00.000-05:00'), // Thu, Jan 15 5am ET
    };

    expect(resolveAvailability(schedulingParameters, range, 'America/New_York')).toEqual([
      // Wed Jan 14 20:00 ET - Thu Jan 15, 2:00am ET
      { start: new Date('2026-01-15T01:00:00.000Z'), end: new Date('2026-01-15T07:00:00.000Z') },
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
      serviceType: [],
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
      serviceType: [],
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
      serviceType: [],
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

  test('empty availability returns an empty result', () => {
    const blocks = [{ start: new Date('2025-12-02T10:00:00Z'), end: new Date('2025-12-02T14:00:00Z') }];
    expect(removeAvailability([], blocks)).toEqual([]);
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

  test('block spanning multiple availability windows apply to all of them', () => {
    const availability = [
      { start: new Date('2025-12-01'), end: new Date('2025-12-03') },
      { start: new Date('2025-12-04'), end: new Date('2025-12-05') },
      { start: new Date('2025-12-06'), end: new Date('2025-12-08') },
    ];
    const blocks = [{ start: new Date('2025-12-02'), end: new Date('2025-12-07') }];
    expect(removeAvailability(availability, blocks)).toEqual([
      { start: new Date('2025-12-01'), end: new Date('2025-12-02') }, // first interval gets end cut off
      // second interval blocked entirely
      { start: new Date('2025-12-07'), end: new Date('2025-12-08') }, // third interval gets front cut
    ]);
  });

  test('many small availability windows within one large block', () => {
    const availability = [
      { start: new Date('2025-12-01T10:00:00Z'), end: new Date('2025-12-01T10:15:00Z') },
      { start: new Date('2025-12-01T10:30:00Z'), end: new Date('2025-12-01T10:45:00Z') },
      { start: new Date('2025-12-01T11:00:00Z'), end: new Date('2025-12-01T11:15:00Z') },
      { start: new Date('2025-12-01T11:30:00Z'), end: new Date('2025-12-01T11:45:00Z') },
    ];
    const blocks = [{ start: new Date('2025-12-01T09:00:00Z'), end: new Date('2025-12-01T12:00:00Z') }];
    expect(removeAvailability(availability, blocks)).toEqual([]);
  });
});

function makeSlots(
  schedule: Schedule,
  intervals: Interval[],
  status: Slot['status'] = 'busy',
  serviceType?: Slot['serviceType']
): Slot[] {
  return intervals.map((interval) => ({
    resourceType: 'Slot',
    schedule: { reference: `Schedule/${schedule.id}` },
    status,
    start: interval.start.toISOString(),
    end: interval.end.toISOString(),
    serviceType,
  }));
}

describe('applyExistingSlots', () => {
  test('with no availability or free slots', () => {
    const range = { start: new Date('2025-12-01'), end: new Date('2025-12-30') };
    expect(applyExistingSlots({ availability: [], slots: [], range })).toEqual([]);
  });

  test('returns the input availability when no slot overrides exist', () => {
    const availability = [
      { start: new Date('2025-12-01'), end: new Date('2025-12-02') },
      { start: new Date('2025-12-03'), end: new Date('2025-12-04') },
      { start: new Date('2025-12-05'), end: new Date('2025-12-06') },
    ];
    const range = { start: new Date('2025-12-01'), end: new Date('2025-12-30') };
    expect(applyExistingSlots({ availability, slots: [], range })).toEqual(availability);
  });

  test('returns free slots as available time', () => {
    const freeIntervals = [{ start: new Date('2025-12-01T10:00:00.000Z'), end: new Date('2025-12-01T14:00:00.000Z') }];
    const slots = makeSlots(schedule, freeIntervals, 'free');
    const range = { start: new Date('2025-12-01'), end: new Date('2025-12-30') };
    expect(applyExistingSlots({ availability: [], slots, range })).toEqual(freeIntervals);
  });

  test('free slots wider than the queried range are truncated', () => {
    const freeIntervals = [{ start: new Date('2025-12-01'), end: new Date('2025-12-07') }];
    const slots = makeSlots(schedule, freeIntervals, 'free');
    const range = { start: new Date('2025-12-02'), end: new Date('2025-12-04') };
    expect(applyExistingSlots({ availability: [], slots, range })).toEqual([range]);
  });

  test('it removes busy slots from the availability', () => {
    const availability = [
      { start: new Date('2025-12-01T12:00:00-05:00'), end: new Date('2025-12-01T16:00:00-05:00') },
      { start: new Date('2025-12-03T12:00:00-05:00'), end: new Date('2025-12-03T16:00:00-05:00') },
    ];
    const busyIntervals = [
      { start: new Date('2025-12-01T10:00:00-05:00'), end: new Date('2025-12-01T14:00:00-05:00') },
    ];
    const slots = makeSlots(schedule, busyIntervals, 'busy');
    const range = { start: new Date('2025-12-01'), end: new Date('2025-12-30') };
    expect(applyExistingSlots({ availability, slots, range })).toEqual([
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
    expect(applyExistingSlots({ availability, slots, range })).toEqual([
      { start: new Date('2025-12-01T14:00:00-05:00'), end: new Date('2025-12-01T16:00:00-05:00') },
      { start: new Date('2025-12-03T12:00:00-05:00'), end: new Date('2025-12-03T16:00:00-05:00') },
    ]);
  });

  test('it removes busy-tentative slots from the availability', () => {
    const availability = [{ start: new Date('2025-12-01T12:00:00-05:00'), end: new Date('2025-12-01T16:00:00-05:00') }];
    const busyTentativeIntervals = [
      { start: new Date('2025-12-01T10:00:00-05:00'), end: new Date('2025-12-01T14:00:00-05:00') },
    ];
    const slots = makeSlots(schedule, busyTentativeIntervals, 'busy-tentative');
    const range = { start: new Date('2025-12-01'), end: new Date('2025-12-30') };
    expect(applyExistingSlots({ availability, slots, range })).toEqual([
      { start: new Date('2025-12-01T14:00:00-05:00'), end: new Date('2025-12-01T16:00:00-05:00') },
    ]);
  });

  test('it ignores entered-in-error slots', () => {
    const availability = [{ start: new Date('2025-12-01T12:00:00-05:00'), end: new Date('2025-12-01T16:00:00-05:00') }];
    const enteredInErrorIntervals = [
      { start: new Date('2025-12-01T10:00:00-05:00'), end: new Date('2025-12-01T14:00:00-05:00') },
    ];
    const slots = makeSlots(schedule, enteredInErrorIntervals, 'entered-in-error');
    const range = { start: new Date('2025-12-01'), end: new Date('2025-12-30') };
    expect(applyExistingSlots({ availability, slots, range })).toEqual([
      { start: new Date('2025-12-01T12:00:00-05:00'), end: new Date('2025-12-01T16:00:00-05:00') },
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
    expect(applyExistingSlots({ availability, slots, range })).toEqual([
      { start: new Date('2025-12-01T14:00:00-05:00'), end: new Date('2025-12-01T16:00:00-05:00') },
      { start: new Date('2025-12-03T12:00:00-05:00'), end: new Date('2025-12-03T16:00:00-05:00') },
    ]);
  });

  test('free slots without service type match any requested service type', () => {
    const freeIntervals = [{ start: new Date('2025-12-01T10:00:00.000Z'), end: new Date('2025-12-01T14:00:00.000Z') }];
    const slots = makeSlots(schedule, freeIntervals, 'free'); // No serviceType
    const range = { start: new Date('2025-12-01'), end: new Date('2025-12-30') };
    const serviceType = [{ system: 'http://example.com', code: 'office-visit' }];

    expect(applyExistingSlots({ availability: [], slots, range, serviceType })).toEqual(freeIntervals);
  });

  test('free slots with matching service type are included', () => {
    const serviceType = [{ system: 'http://example.com', code: 'office-visit' }];
    const freeIntervals = [{ start: new Date('2025-12-01T10:00:00.000Z'), end: new Date('2025-12-01T14:00:00.000Z') }];
    const slots = makeSlots(schedule, freeIntervals, 'free', [{ coding: serviceType }]);
    const range = { start: new Date('2025-12-01'), end: new Date('2025-12-30') };

    expect(applyExistingSlots({ availability: [], slots, range, serviceType })).toEqual(freeIntervals);
  });

  test('free slots with non-matching service type are excluded', () => {
    const serviceType = [{ system: 'http://example.com', code: 'office-visit' }];
    const freeIntervals = [{ start: new Date('2025-12-01T10:00:00.000Z'), end: new Date('2025-12-01T14:00:00.000Z') }];
    const slotServiceType = [{ coding: [{ system: 'http://example.com', code: 'new-patient' }] }];
    const slots = makeSlots(schedule, freeIntervals, 'free', slotServiceType);
    const range = { start: new Date('2025-12-01'), end: new Date('2025-12-30') };

    expect(applyExistingSlots({ availability: [], slots, range, serviceType })).toEqual([]);
  });

  test('free slots do not match when system matches but code differs', () => {
    const system = 'http://example.com';
    const serviceType = [{ system, code: 'checkup' }];
    const freeIntervals = [{ start: new Date('2025-12-01T10:00:00.000Z'), end: new Date('2025-12-01T14:00:00.000Z') }];
    const slotServiceType = [{ coding: [{ system, code: 'office-visit' }] }];
    const slots = makeSlots(schedule, freeIntervals, 'free', slotServiceType);
    const range = { start: new Date('2025-12-01'), end: new Date('2025-12-30') };
    expect(applyExistingSlots({ availability: [], slots, range, serviceType })).toEqual([]);
  });

  test('free slots do not match when code matches but system differs', () => {
    const code = 'office-visit';
    const serviceType = [{ system: 'http://other.com', code }];
    const freeIntervals = [{ start: new Date('2025-12-01T10:00:00.000Z'), end: new Date('2025-12-01T14:00:00.000Z') }];
    const slotServiceType = [{ coding: [{ system: 'http://example.com', code }] }];
    const slots = makeSlots(schedule, freeIntervals, 'free', slotServiceType);
    const range = { start: new Date('2025-12-01'), end: new Date('2025-12-30') };

    // Should not match because system differs
    expect(applyExistingSlots({ availability: [], slots, range, serviceType })).toEqual([]);
  });

  test('free slots with multiple service types match if any overlaps', () => {
    const freeIntervals = [{ start: new Date('2025-12-01T10:00:00.000Z'), end: new Date('2025-12-01T14:00:00.000Z') }];
    const slotServiceType = [
      { coding: [{ system: 'http://example.com', code: 'new-patient' }] },
      { coding: [{ system: 'http://example.com', code: 'office-visit' }] },
    ];
    const slots = makeSlots(schedule, freeIntervals, 'free', slotServiceType);
    const range = { start: new Date('2025-12-01'), end: new Date('2025-12-30') };
    const serviceType = [{ system: 'http://example.com', code: 'office-visit' }];

    expect(applyExistingSlots({ availability: [], slots, range, serviceType })).toEqual(freeIntervals);
  });
});
