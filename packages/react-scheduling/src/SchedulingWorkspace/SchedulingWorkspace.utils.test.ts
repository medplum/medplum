// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { TimezoneExtensionURI } from '@medplum/core';
import type { Appointment, Practitioner, Schedule, Slot } from '@medplum/fhirtypes';
import type { ScheduleCandidate } from '../AppointmentFinder/AppointmentFinder.schedules';
import { formatZonedTime } from '../AppointmentFinder/AppointmentFinder.times';
import {
  filterSlotsByDrawnAppointments,
  formatWhen,
  getCalendarTimezones,
  isPastEditWindow,
} from './SchedulingWorkspace.utils';

const EASTERN = 'America/New_York';

const SCHEDULE: WithId<Schedule> = {
  resourceType: 'Schedule',
  id: 'dr-rivera-schedule',
  actor: [{ reference: 'Practitioner/dr-rivera' }],
};

function candidateOf(timezone?: string, read = true): ScheduleCandidate {
  if (!read) {
    return { schedule: SCHEDULE, actorResource: undefined };
  }
  const actorResource: WithId<Practitioner> = {
    resourceType: 'Practitioner',
    id: 'dr-rivera',
    extension: timezone ? [{ url: TimezoneExtensionURI, valueCode: timezone }] : undefined,
  };
  return { schedule: SCHEDULE, actorResource };
}

describe('getCalendarTimezones', () => {
  test('Reads the zone off each actor that named one', () => {
    expect(getCalendarTimezones([candidateOf(EASTERN)])).toStrictEqual({ timezones: [EASTERN], anyUnknown: false });
  });

  test('Passes over an actor that was read and named no zone', () => {
    // Rooms and devices routinely carry no zone of their own, so this is the ordinary
    // case rather than something to warn about.
    expect(getCalendarTimezones([candidateOf()])).toStrictEqual({ timezones: [], anyUnknown: false });
  });

  test('Reports an actor that could not be read as unknown', () => {
    // An access policy may allow reading a Schedule but not its actor. The zone is
    // written on the actor, so it cannot be told, and the caller has to say so.
    expect(getCalendarTimezones([candidateOf(undefined, false)])).toStrictEqual({
      timezones: [],
      anyUnknown: true,
    });
  });

  test('Keeps the zones it could read alongside the ones it could not', () => {
    const candidates = [candidateOf(EASTERN), candidateOf(undefined, false)];

    expect(getCalendarTimezones(candidates)).toStrictEqual({ timezones: [EASTERN], anyUnknown: true });
  });

  test('Reads nothing off no calendars', () => {
    expect(getCalendarTimezones([])).toStrictEqual({ timezones: [], anyUnknown: false });
  });
});

describe('formatWhen', () => {
  test('Names the day once for a period within it, and both days for one running past it', () => {
    const mondayNine = new Date(2020, 4, 4, 9);
    const mondayFive = new Date(2020, 4, 4, 17);
    const fridayFive = new Date(2020, 4, 8, 17);

    expect(formatWhen({ start: mondayNine.toISOString(), end: mondayFive.toISOString() })).toBe(
      `Monday, May 4 · ${formatZonedTime(mondayNine)} – ${formatZonedTime(mondayFive)}`
    );
    expect(formatWhen({ start: mondayNine.toISOString(), end: fridayFive.toISOString() })).toBe(
      `Monday, May 4 · ${formatZonedTime(mondayNine)} – Friday, May 8 · ${formatZonedTime(fridayFive)}`
    );
    expect(formatWhen({})).toBeUndefined();
  });
});

describe('isPastEditWindow', () => {
  const visit: Appointment = {
    resourceType: 'Appointment',
    status: 'booked',
    participant: [],
    start: '2020-05-04T09:00:00Z',
    end: '2020-05-04T10:00:00Z',
  };

  test('Stays open for 12 hours after the visit ends, and closes then', () => {
    expect(isPastEditWindow(visit, new Date('2020-05-04T21:59:59Z'))).toBe(false);
    expect(isPastEditWindow(visit, new Date('2020-05-04T22:00:00Z'))).toBe(true);
  });

  test('Judges a visit with no end by its start, and one with neither as open', () => {
    expect(isPastEditWindow({ ...visit, end: undefined }, new Date('2020-05-04T21:00:00Z'))).toBe(true);
    expect(isPastEditWindow({ ...visit, start: undefined, end: undefined }, new Date('2020-05-05T09:00:00Z'))).toBe(
      false
    );
  });
});

describe('filterSlotsByDrawnAppointments', () => {
  const slotOf = (id: string, status: Slot['status']): WithId<Slot> => ({
    resourceType: 'Slot',
    id,
    status,
    schedule: { reference: 'Schedule/dr-rivera-schedule' },
    start: '2020-05-04T09:00:00Z',
    end: '2020-05-04T10:00:00Z',
  });
  const visitOf = (...slots: Slot[]): Appointment => ({
    resourceType: 'Appointment',
    status: 'booked',
    participant: [],
    slot: slots.map((slot) => ({ reference: `Slot/${slot.id}` })),
  });

  const block = slotOf('out-of-office', 'busy-unavailable');
  const drawnVisit = slotOf('drawn-visit', 'busy');
  const drawnBuffer = slotOf('drawn-buffer', 'busy-unavailable');
  const hiddenVisit = slotOf('hidden-visit', 'busy');
  const hiddenBuffer = slotOf('hidden-buffer', 'busy-unavailable');
  const slots = [block, drawnVisit, drawnBuffer, hiddenVisit, hiddenBuffer];
  const drawn = visitOf(drawnVisit, drawnBuffer);
  const hidden = visitOf(hiddenVisit, hiddenBuffer);

  test('Keeps a Slot no loaded appointment holds', () => {
    expect(filterSlotsByDrawnAppointments(slots, [drawn, hidden], [])).toStrictEqual([block]);
  });

  test("Keeps a drawn appointment's Slots and drops a hidden one's, though a buffer has a block's status", () => {
    expect(filterSlotsByDrawnAppointments(slots, [drawn, hidden], [drawn])).toStrictEqual([
      block,
      drawnVisit,
      drawnBuffer,
    ]);
  });
});
