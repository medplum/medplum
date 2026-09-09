// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { TimezoneExtensionURI } from '@medplum/core';
import type { Practitioner, Schedule } from '@medplum/fhirtypes';
import type { WithId } from '@medplum/core';
import type { ScheduleCandidate } from '../AppointmentFinder/AppointmentFinder.schedules';
import { getCalendarTimezones } from './SchedulingWorkspace.utils';

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
