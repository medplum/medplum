// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { tz, TZDate } from '@date-fns/tz';
import type { Interval } from 'date-fns';
import { resolveAvailability } from './find';
import type { SchedulingParameters } from './scheduling-parameters';

const tzny = tz('America/New_York');

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
});
