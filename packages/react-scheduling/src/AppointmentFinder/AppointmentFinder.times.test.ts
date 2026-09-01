// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Resource } from '@medplum/fhirtypes';
import { buildProposedAppointment, DrRiveraPractitioner, ExamRoomA } from '../stories/scheduling';
import {
  MAX_FIND_WINDOW_DAYS,
  endOfMonth,
  enumerateDateRange,
  filterByTimeOfDay,
  formatDateRange,
  formatZonedTime,
  getActorGroupKey,
  getAppointmentActors,
  getAppointmentKey,
  getDurationMinutes,
  getFindWindowError,
  groupAppointmentsByDay,
  parseDayKey,
  parseZonedTime,
} from './AppointmentFinder.times';

const EASTERN = 'America/New_York';

/** The resources a caller had already read, keyed as a proposal names them. */
const RESOURCES = new Map<string, WithId<Resource>>([
  ['Practitioner/dr-rivera', DrRiveraPractitioner],
  ['Location/exam-room-a', ExamRoomA],
]);

describe('filterByTimeOfDay', () => {
  const morning = buildProposedAppointment({ start: '2026-07-27T13:00:00.000Z' }); // 9:00 Eastern
  const afternoon = buildProposedAppointment({ start: '2026-07-27T17:30:00.000Z' }); // 13:30 Eastern

  test('Keeps everything for "any"', () => {
    expect(filterByTimeOfDay([morning, afternoon], 'any', EASTERN)).toHaveLength(2);
  });

  test("Splits the day in the scheduling timezone, not the browser's", () => {
    expect(filterByTimeOfDay([morning, afternoon], 'morning', EASTERN)).toStrictEqual([morning]);
    expect(filterByTimeOfDay([morning, afternoon], 'afternoon', EASTERN)).toStrictEqual([afternoon]);

    // The same instant is already afternoon in UTC, so the zone decides.
    expect(filterByTimeOfDay([morning], 'morning', 'Etc/UTC')).toStrictEqual([]);
  });
});

describe('groupAppointmentsByDay', () => {
  test('Groups by day and by the actors offering the times', () => {
    const device = ['Device/ultrasound-1'];
    const provider = ['Practitioner/dr-rivera'];
    const appointments = [
      buildProposedAppointment({ start: '2026-07-27T13:00:00.000Z', actorReferences: device }),
      buildProposedAppointment({ start: '2026-07-27T13:30:00.000Z', actorReferences: device }),
      buildProposedAppointment({ start: '2026-07-27T13:00:00.000Z', actorReferences: provider }),
      buildProposedAppointment({ start: '2026-07-28T13:00:00.000Z', actorReferences: device }),
    ];

    const days = groupAppointmentsByDay(appointments, EASTERN);

    expect(days.map((day) => day.key)).toStrictEqual(['2026-07-27', '2026-07-28']);
    expect(days[0].groups).toHaveLength(2);
    expect(days[0].groups.map((group) => group.appointments.length).sort()).toStrictEqual([1, 2]);
    expect(days[1].groups).toHaveLength(1);
  });

  test('Assigns days in the scheduling timezone', () => {
    // 00:30 UTC on the 28th is still the evening of the 27th in Eastern time.
    const lateEvening = buildProposedAppointment({ start: '2026-07-28T00:30:00.000Z' });

    expect(groupAppointmentsByDay([lateEvening], EASTERN)[0].key).toBe('2026-07-27');
    expect(groupAppointmentsByDay([lateEvening], 'Etc/UTC')[0].key).toBe('2026-07-28');
  });

  test('Reports the duration and sorts times ascending', () => {
    const days = groupAppointmentsByDay(
      [
        buildProposedAppointment({ start: '2026-07-27T14:00:00.000Z', durationMinutes: 45 }),
        buildProposedAppointment({ start: '2026-07-27T13:00:00.000Z', durationMinutes: 45 }),
      ],
      EASTERN
    );

    expect(days[0].groups[0].durationMinutes).toBe(45);
    expect(days[0].groups[0].appointments.map((appointment) => appointment.start)).toStrictEqual([
      '2026-07-27T13:00:00.000Z',
      '2026-07-27T14:00:00.000Z',
    ]);
  });

  test('Skips appointments with no start', () => {
    expect(
      groupAppointmentsByDay([{ resourceType: 'Appointment', status: 'proposed', participant: [] }])
    ).toStrictEqual([]);
  });

  test('Produces a local date matching the zoned day', () => {
    const [day] = groupAppointmentsByDay([buildProposedAppointment({ start: '2026-07-27T13:00:00.000Z' })], EASTERN);
    expect(day.date.getFullYear()).toBe(2026);
    expect(day.date.getMonth()).toBe(6);
    expect(day.date.getDate()).toBe(27);
  });

  test('Heads a group with the actors themselves where it was given them', () => {
    const appointment = buildProposedAppointment({
      start: '2026-07-27T13:00:00.000Z',
      actorReferences: [{ reference: 'Practitioner/dr-rivera' }, { reference: 'Location/exam-room-a' }],
    });

    const [day] = groupAppointmentsByDay([appointment], EASTERN, RESOURCES);

    expect(day.groups[0].actors).toStrictEqual([DrRiveraPractitioner, ExamRoomA]);
    // Keyed off the proposal's own references, so supplying resources cannot
    // regroup the times or break a React key across a refetch.
    expect(day.groups[0].key).toBe(groupAppointmentsByDay([appointment], EASTERN)[0].groups[0].key);
  });
});


describe('getAppointmentActors', () => {
  test('Swaps in each actor resource the caller had already read', () => {
    const appointment = buildProposedAppointment({
      start: '2026-07-27T13:00:00.000Z',
      actorReferences: [{ reference: 'Practitioner/dr-rivera', display: 'Maya Rivera' }],
    });

    // The resource wins over the name `$find` copied off the Schedule.
    expect(getAppointmentActors(appointment, RESOURCES)).toStrictEqual([DrRiveraPractitioner]);
  });

  test('Leaves an actor it was given no resource for as the proposal named it', () => {
    const actor = { reference: 'Device/ultrasound-1', display: 'Ultrasound 1' };
    const appointment = buildProposedAppointment({ start: '2026-07-27T13:00:00.000Z', actorReferences: [actor] });

    expect(getAppointmentActors(appointment, RESOURCES)).toStrictEqual([actor]);
    expect(getAppointmentActors(appointment)).toStrictEqual([actor]);
  });

  test('Reads nothing off nothing', () => {
    expect(getAppointmentActors(undefined, RESOURCES)).toStrictEqual([]);
  });
});

describe('keys and durations', () => {
  test('Actor group key is order-independent', () => {
    const left = buildProposedAppointment({
      start: '2026-07-27T13:00:00.000Z',
      actorReferences: ['Device/ultrasound-1', 'Practitioner/dr-rivera'],
    });
    const right = buildProposedAppointment({
      start: '2026-07-27T13:00:00.000Z',
      actorReferences: ['Practitioner/dr-rivera', 'Device/ultrasound-1'],
    });

    expect(getActorGroupKey(left)).toBe(getActorGroupKey(right));
  });

  test('Appointment key separates the same time from different actors', () => {
    const device = buildProposedAppointment({ start: '2026-07-27T13:00:00.000Z' });
    const provider = buildProposedAppointment({
      start: '2026-07-27T13:00:00.000Z',
      actorReferences: ['Practitioner/dr-rivera'],
    });

    expect(getAppointmentKey(device)).not.toBe(getAppointmentKey(provider));
  });

  test('Duration comes from the appointment itself', () => {
    expect(
      getDurationMinutes(buildProposedAppointment({ start: '2026-07-27T13:00:00.000Z', durationMinutes: 20 }))
    ).toBe(20);
    expect(getDurationMinutes(undefined)).toBe(0);
    expect(getDurationMinutes({ resourceType: 'Appointment', status: 'proposed', participant: [] })).toBe(0);
  });
});

describe('parseZonedTime', () => {
  test('Reads the time on the clinic’s clock, not the browser’s', () => {
    const day = new Date(2026, 6, 27);

    expect(parseZonedTime(day, '09:30', EASTERN)?.toISOString()).toBe('2026-07-27T13:30:00.000Z');
    expect(parseZonedTime(day, '09:30', 'Etc/UTC')?.toISOString()).toBe('2026-07-27T09:30:00.000Z');
  });

  test('Falls back to the browser when no zone is given', () => {
    const parsed = parseZonedTime(new Date(2026, 6, 27), '14:05') as Date;

    expect(parsed.getHours()).toBe(14);
    expect(parsed.getMinutes()).toBe(5);
    expect(parsed.getDate()).toBe(27);
  });

  test('Reads a time on the day the clocks change', () => {
    // Eastern time springs forward at 2am on 8 March 2026, so 3am that day is
    // already UTC-4 rather than the UTC-5 in force at midnight.
    expect(parseZonedTime(new Date(2026, 2, 8), '03:00', EASTERN)?.toISOString()).toBe('2026-03-08T07:00:00.000Z');
    expect(parseZonedTime(new Date(2026, 2, 8), '01:00', EASTERN)?.toISOString()).toBe('2026-03-08T06:00:00.000Z');
  });

  test('Rejects anything that is not a time', () => {
    const day = new Date(2026, 6, 27);

    expect(parseZonedTime(day, '', EASTERN)).toBeUndefined();
    expect(parseZonedTime(day, '9', EASTERN)).toBeUndefined();
    expect(parseZonedTime(day, '25:00', EASTERN)).toBeUndefined();
    expect(parseZonedTime(day, '09:75', EASTERN)).toBeUndefined();
    expect(parseZonedTime(day, 'noon', EASTERN)).toBeUndefined();
  });
});

describe('formatting', () => {
  test('Formats times in the requested zone', () => {
    const time = formatZonedTime(new Date('2026-07-27T16:30:00.000Z'), EASTERN);
    expect(time).toContain('12:30');
    expect(formatZonedTime(new Date('2026-07-27T16:30:00.000Z'), 'Etc/UTC')).toContain('4:30');
  });

  test('Parses a day key as local midnight', () => {
    const date = parseDayKey('2026-07-27');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(6);
    expect(date.getDate()).toBe(27);
    expect(date.getHours()).toBe(0);
  });
});

describe('endOfMonth', () => {
  test('Covers the whole of a month, whatever its length', () => {
    expect(endOfMonth(new Date(2026, 6, 27))).toStrictEqual(new Date(2026, 6, 31, 23, 59, 59, 999));
    expect(endOfMonth(new Date(2026, 1, 3))).toStrictEqual(new Date(2026, 1, 28, 23, 59, 59, 999));
    // A leap February, which the month's own length has to come from rather than
    // from a count of days.
    expect(endOfMonth(new Date(2028, 1, 3))).toStrictEqual(new Date(2028, 1, 29, 23, 59, 59, 999));
  });
});

describe('enumerateDateRange', () => {
  test('Lists every day a range covers', () => {
    const days = enumerateDateRange({ start: new Date(2026, 6, 27), end: new Date(2026, 6, 30) });
    expect(days).toStrictEqual([
      new Date(2026, 6, 27),
      new Date(2026, 6, 28),
      new Date(2026, 6, 29),
      new Date(2026, 6, 30),
    ]);
  });

  test('An open range is only the day it starts on, or nothing at all', () => {
    expect(enumerateDateRange({ start: new Date(2026, 6, 27) })).toStrictEqual([new Date(2026, 6, 27)]);
    expect(enumerateDateRange({})).toStrictEqual([]);
    expect(enumerateDateRange({ end: new Date(2026, 6, 27) })).toStrictEqual([]);
  });

  test('Stops at the limit rather than running a year out', () => {
    const days = enumerateDateRange({ start: new Date(2026, 6, 1), end: new Date(2027, 6, 1) }, 5);
    expect(days).toHaveLength(5);
  });
});

describe('formatDateRange', () => {
  test('Says which days are being searched', () => {
    expect(formatDateRange({ start: new Date(2026, 6, 27), end: new Date(2026, 6, 27) })).toBe('Monday, July 27');
    expect(formatDateRange({ start: new Date(2026, 6, 27), end: new Date(2026, 6, 30) })).toBe(
      'Monday, July 27 – Thursday, July 30'
    );
    expect(formatDateRange({ start: new Date(2026, 6, 27) })).toBe('From Monday, July 27');
    expect(formatDateRange({ end: new Date(2026, 6, 30) })).toBe('Through Thursday, July 30');
  });

  test('Says nothing when neither end was asked for', () => {
    expect(formatDateRange({})).toBeUndefined();
  });
});

describe('getFindWindowError', () => {
  test('A range inside the window can be searched', () => {
    expect(getFindWindowError({ start: new Date(2026, 6, 27), end: new Date(2026, 6, 27, 23, 59) })).toBeUndefined();
    const lastAllowed = new Date(2026, 6, 27);
    lastAllowed.setDate(lastAllowed.getDate() + MAX_FIND_WINDOW_DAYS);
    expect(getFindWindowError({ start: new Date(2026, 6, 27), end: lastAllowed })).toBeUndefined();
  });

  test('A wider range is refused before a request is made for it', () => {
    const tooFar = new Date(2026, 6, 27);
    tooFar.setDate(tooFar.getDate() + MAX_FIND_WINDOW_DAYS + 1);
    expect(getFindWindowError({ start: new Date(2026, 6, 27), end: tooFar })).toBe('Choose at most 31 days at a time.');
  });

  test('An open range says nothing, because there is no width to judge', () => {
    expect(getFindWindowError({})).toBeUndefined();
    expect(getFindWindowError({ start: new Date(2026, 6, 27) })).toBeUndefined();
    expect(getFindWindowError({ end: new Date(2026, 6, 27) })).toBeUndefined();
  });
});
