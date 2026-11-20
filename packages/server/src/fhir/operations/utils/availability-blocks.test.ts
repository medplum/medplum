// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { CodeableConcept, Slot } from '@medplum/fhirtypes';
import type { Interval } from '../../../util/date';
import { LayeredDict } from '../../../util/layereddict';
import { withPath } from '../../../util/withpath';
import type { AnchoredWindow } from './availability-blocks';
import { findAnchor, resolveAnchoredWindows } from './availability-blocks';
import type { SchedulingParameters } from './scheduling-parameters';

const timezone = 'America/New_York';

// Mon Dec 1, 2025 in New York
const monday: Interval = {
  start: new Date('2025-12-01T00:00:00-05:00'),
  end: new Date('2025-12-02T00:00:00-05:00'),
};

const lunchBreak: SchedulingParameters['availability'] = [
  { dayOfWeek: ['mon'], availableStartTime: '09:00:00', availableEndTime: '12:00:00' },
  { dayOfWeek: ['mon'], availableStartTime: '13:00:00', availableEndTime: '17:00:00' },
];

function resolve(
  availability: SchedulingParameters['availability'],
  range: Interval,
  slots: Slot[] = [],
  serviceType?: CodeableConcept[]
): AnchoredWindow[] {
  const parameters = LayeredDict.from(
    withPath<SchedulingParameters>(
      {
        availability,
        duration: 60,
        bufferBefore: 0,
        bufferAfter: 0,
        alignmentInterval: 60,
        alignmentOffset: 0,
        alignmentTimezone: 'Etc/UTC',
        service: { reference: 'HealthcareService/test' },
        slotCapacity: 1,
      },
      'test'
    )
  );
  return resolveAnchoredWindows({ parameters, timezone, slots, range, serviceType });
}

function slot(status: Slot['status'], start: string, end: string, serviceType?: CodeableConcept[]): Slot {
  return { resourceType: 'Slot', schedule: { reference: 'Schedule/test' }, status, start, end, serviceType };
}

function window(start: string, end: string, anchors: string[]): AnchoredWindow {
  return { start: new Date(start), end: new Date(end), anchors: anchors.map((anchor) => new Date(anchor)) };
}

describe('resolveAnchoredWindows', () => {
  test('hours with a lunch gap give two windows, each anchored at its start', () => {
    expect(resolve(lunchBreak, monday)).toEqual([
      window('2025-12-01T09:00:00-05:00', '2025-12-01T12:00:00-05:00', ['2025-12-01T09:00:00-05:00']),
      window('2025-12-01T13:00:00-05:00', '2025-12-01T17:00:00-05:00', ['2025-12-01T13:00:00-05:00']),
    ]);
  });

  test('touching and overlapping hours on the same day merge into one block', () => {
    const availability: SchedulingParameters['availability'] = [
      { dayOfWeek: ['mon'], availableStartTime: '09:00:00', availableEndTime: '11:00:00' },
      { dayOfWeek: ['mon'], availableStartTime: '11:00:00', availableEndTime: '13:00:00' },
      { dayOfWeek: ['mon'], availableStartTime: '12:00:00', availableEndTime: '15:00:00' },
    ];
    expect(resolve(availability, monday)).toEqual([
      window('2025-12-01T09:00:00-05:00', '2025-12-01T15:00:00-05:00', ['2025-12-01T09:00:00-05:00']),
    ]);
  });

  test('round-the-clock hours anchor at local midnight each day, across a DST change', () => {
    const availability: SchedulingParameters['availability'] = [
      {
        dayOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
        availableStartTime: '00:00:00',
        availableEndTime: '00:00:00',
      },
    ];
    // New York springs forward on Sun Mar 8, 2026
    const windows = resolve(availability, {
      start: new Date('2026-03-07T12:00:00-05:00'),
      end: new Date('2026-03-09T12:00:00-04:00'),
    });
    expect(windows).toHaveLength(1);
    expect(windows[0].anchors).toEqual(
      expect.arrayContaining([
        new Date('2026-03-07T00:00:00-05:00'),
        new Date('2026-03-08T00:00:00-05:00'),
        new Date('2026-03-09T00:00:00-04:00'),
      ])
    );
    expect(findAnchor(windows, new Date('2026-03-08T23:00:00-04:00'))).toEqual(new Date('2026-03-08T00:00:00-05:00'));
    expect(findAnchor(windows, new Date('2026-03-09T09:00:00-04:00'))).toEqual(new Date('2026-03-09T00:00:00-04:00'));
  });

  test('an overnight entry is one block anchored on the day it starts, found from the next day', () => {
    const availability: SchedulingParameters['availability'] = [
      { dayOfWeek: ['mon'], availableStartTime: '22:00:00', availableEndTime: '06:00:00' },
    ];
    const tuesdayMorning = { start: new Date('2025-12-02T02:00:00-05:00'), end: new Date('2025-12-02T03:00:00-05:00') };
    expect(resolve(availability, tuesdayMorning)).toEqual([
      window('2025-12-01T22:00:00-05:00', '2025-12-02T06:00:00-05:00', ['2025-12-01T22:00:00-05:00']),
    ]);
  });

  test('an overnight entry across a DST change keeps its local start', () => {
    const availability: SchedulingParameters['availability'] = [
      { dayOfWeek: ['sat'], availableStartTime: '22:00:00', availableEndTime: '06:00:00' },
      { dayOfWeek: ['sun'], availableStartTime: '09:00:00', availableEndTime: '12:00:00' },
    ];
    const sunday = { start: new Date('2026-03-08T00:00:00-05:00'), end: new Date('2026-03-09T00:00:00-04:00') };
    expect(resolve(availability, sunday)).toEqual([
      window('2026-03-07T22:00:00-05:00', '2026-03-08T06:00:00-04:00', ['2026-03-07T22:00:00-05:00']),
      window('2026-03-08T09:00:00-04:00', '2026-03-08T12:00:00-04:00', ['2026-03-08T09:00:00-04:00']),
    ]);
  });

  test('hours on adjacent days that touch at midnight keep separate anchors', () => {
    const availability: SchedulingParameters['availability'] = [
      { dayOfWeek: ['mon'], availableStartTime: '18:00:00', availableEndTime: '00:00:00' },
      { dayOfWeek: ['tue'], availableStartTime: '00:00:00', availableEndTime: '06:00:00' },
    ];
    const windows = resolve(availability, monday);
    expect(windows).toEqual([
      window('2025-12-01T18:00:00-05:00', '2025-12-02T06:00:00-05:00', [
        '2025-12-01T18:00:00-05:00',
        '2025-12-02T00:00:00-05:00',
      ]),
    ]);
    expect(findAnchor(windows, new Date('2025-12-02T01:00:00-05:00'))).toEqual(new Date('2025-12-02T00:00:00-05:00'));
  });

  test('a free Slot in front of the hours extends the window without adding an anchor', () => {
    const availability: SchedulingParameters['availability'] = [
      { dayOfWeek: ['mon'], availableStartTime: '08:30:00', availableEndTime: '17:00:00' },
    ];
    const slots = [slot('free', '2025-12-01T08:00:00-05:00', '2025-12-01T08:30:00-05:00')];
    const windows = resolve(availability, monday, slots);
    expect(windows).toEqual([
      window('2025-12-01T08:00:00-05:00', '2025-12-01T17:00:00-05:00', ['2025-12-01T08:30:00-05:00']),
    ]);
    expect(findAnchor(windows, new Date('2025-12-01T08:00:00-05:00'))).toEqual(new Date('2025-12-01T08:30:00-05:00'));
  });

  test('a free Slot after the hours extends the window on the same grid', () => {
    const availability: SchedulingParameters['availability'] = [
      { dayOfWeek: ['mon'], availableStartTime: '08:30:00', availableEndTime: '17:00:00' },
    ];
    const slots = [slot('free', '2025-12-01T17:00:00-05:00', '2025-12-01T18:00:00-05:00')];
    const windows = resolve(availability, monday, slots);
    expect(windows).toEqual([
      window('2025-12-01T08:30:00-05:00', '2025-12-01T18:00:00-05:00', ['2025-12-01T08:30:00-05:00']),
    ]);
    expect(findAnchor(windows, new Date('2025-12-01T17:30:00-05:00'))).toEqual(new Date('2025-12-01T08:30:00-05:00'));
  });

  test('a free Slot running up to hours on the next day takes their grid, however narrow the range', () => {
    const availability: SchedulingParameters['availability'] = [
      { dayOfWeek: ['tue'], availableStartTime: '00:00:00', availableEndTime: '06:00:00' },
    ];
    const slots = [slot('free', '2025-12-01T22:00:00-05:00', '2025-12-02T00:00:00-05:00')];
    const lateMonday = { start: new Date('2025-12-01T22:00:00-05:00'), end: new Date('2025-12-01T23:00:00-05:00') };
    const windows = resolve(availability, lateMonday, slots);
    expect(windows).toEqual([
      window('2025-12-01T22:00:00-05:00', '2025-12-02T06:00:00-05:00', ['2025-12-02T00:00:00-05:00']),
    ]);
    expect(findAnchor(windows, new Date('2025-12-01T22:00:00-05:00'))).toEqual(new Date('2025-12-02T00:00:00-05:00'));
  });

  test('a free Slot touching no hours anchors at its own start', () => {
    const slots = [slot('free', '2025-12-01T19:15:00-05:00', '2025-12-01T21:00:00-05:00')];
    const windows = resolve(lunchBreak, monday, slots);
    expect(windows[2]).toEqual(window('2025-12-01T19:15:00-05:00', '2025-12-01T21:00:00-05:00', []));
    expect(findAnchor(windows, new Date('2025-12-01T20:00:00-05:00'))).toEqual(new Date('2025-12-01T19:15:00-05:00'));
  });

  test('a free Slot filling the lunch gap leaves both anchors in place', () => {
    const slots = [slot('free', '2025-12-01T12:00:00-05:00', '2025-12-01T13:00:00-05:00')];
    const windows = resolve(lunchBreak, monday, slots);
    expect(windows).toEqual([
      window('2025-12-01T09:00:00-05:00', '2025-12-01T17:00:00-05:00', [
        '2025-12-01T09:00:00-05:00',
        '2025-12-01T13:00:00-05:00',
      ]),
    ]);
    expect(findAnchor(windows, new Date('2025-12-01T12:30:00-05:00'))).toEqual(new Date('2025-12-01T09:00:00-05:00'));
    expect(findAnchor(windows, new Date('2025-12-01T13:30:00-05:00'))).toEqual(new Date('2025-12-01T13:00:00-05:00'));
  });

  test('blocking Slots and free Slots for another service are ignored', () => {
    const otherService = [{ coding: [{ system: 'http://example.com', code: 'other' }] }];
    const slots = [
      slot('busy', '2025-12-01T09:00:00-05:00', '2025-12-01T10:00:00-05:00'),
      slot('busy-unavailable', '2025-12-01T08:00:00-05:00', '2025-12-01T09:00:00-05:00'),
      slot('free', '2025-12-01T12:00:00-05:00', '2025-12-01T13:00:00-05:00', otherService),
    ];
    const serviceType = [{ coding: [{ system: 'http://example.com', code: 'visit' }] }];
    expect(resolve(lunchBreak, monday, slots, serviceType)).toEqual(resolve(lunchBreak, monday));
  });

  test('a narrow range gives the same windows and anchors as the whole day', () => {
    const slots = [slot('free', '2025-12-01T08:00:00-05:00', '2025-12-01T09:00:00-05:00')];
    const full = resolve(lunchBreak, monday, slots);
    const morning = { start: new Date('2025-12-01T08:15:00-05:00'), end: new Date('2025-12-01T08:45:00-05:00') };
    const afternoon = { start: new Date('2025-12-01T14:00:00-05:00'), end: new Date('2025-12-01T14:30:00-05:00') };
    expect(resolve(lunchBreak, morning, slots)).toEqual([full[0]]);
    expect(resolve(lunchBreak, afternoon, slots)).toEqual([full[1]]);
  });
});

describe('findAnchor', () => {
  test('returns undefined outside every window', () => {
    const windows = resolve(lunchBreak, monday);
    expect(findAnchor(windows, new Date('2025-12-01T12:30:00-05:00'))).toBeUndefined();
    expect(findAnchor(windows, new Date('2025-12-01T17:00:00-05:00'))).toBeUndefined();
  });
});
