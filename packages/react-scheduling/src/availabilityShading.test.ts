// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import {
  allServiceTypesCodeableConcept,
  setScheduleSchedulingParameter,
  toServiceTypeCodeableConcepts,
} from '@medplum/core';
import type {
  Appointment,
  Extension,
  HealthcareService,
  Location,
  Reference,
  Schedule,
  Slot,
} from '@medplum/fhirtypes';
import type { AvailabilityShade, AvailabilityShadingCalendar } from './availabilityShading';
import { AVAILABILITY_SERVICE_FACILITY_URL, computeAvailabilityShading } from './availabilityShading';

// Monday 4 May 2020, read in the runner's zone throughout.
const MONDAY = new Date(2020, 4, 4);
const range = { start: MONDAY, end: new Date(2020, 4, 5) };

function at(hours: number, minutes = 0): Date {
  return new Date(2020, 4, 4, hours, minutes);
}

function service(id: string, name: string): WithId<HealthcareService> {
  return {
    resourceType: 'HealthcareService',
    id,
    name,
    availableTime: [{ daysOfWeek: ['mon'], availableStartTime: '09:00:00', availableEndTime: '17:00:00' }],
  };
}

const newPatient = service('new-patient', 'New Patient');
const consult = service('consult', 'Consult');
const followUp = service('follow-up', 'Follow-up');
const injections = service('injections', 'Injections');
const procedures = service('procedures', 'Procedures');
const telehealth = service('telehealth', 'Telehealth');
const services = [newPatient, consult, followUp, injections, procedures, telehealth];

// New Patient and Consult share a color, as two visit types an admin grouped would.
const COLORS: Record<string, string> = {
  'new-patient': 'green',
  consult: 'green',
  'follow-up': 'blue',
  injections: 'orange',
  procedures: 'violet',
  telehealth: 'cyan',
};
const colorOf = (s: WithId<HealthcareService>): string => COLORS[s.id];

const riverside: Reference<Location> = { reference: 'Location/riverside', display: 'Riverside' };
const northgate: Reference<Location> = { reference: 'Location/northgate', display: 'Northgate' };

function window(start: string, end: string, facility?: Reference<Location>): Extension {
  return {
    url: 'availableTime',
    extension: [
      { url: 'daysOfWeek', valueCode: 'mon' },
      { url: 'availableStartTime', valueTime: start },
      { url: 'availableEndTime', valueTime: end },
      ...(facility ? [{ url: AVAILABILITY_SERVICE_FACILITY_URL, valueReference: facility }] : []),
    ],
  };
}

function schedule(id: string, hours: [WithId<HealthcareService>, ...Extension[]][]): WithId<Schedule> {
  const base: WithId<Schedule> = { resourceType: 'Schedule', id, actor: [{ reference: `Practitioner/${id}` }] };
  return hours.reduce(
    (result, [s, ...windows]) => setScheduleSchedulingParameter(result, s, { url: 'availability', extension: windows }),
    base
  );
}

function appointment(s: WithId<HealthcareService>, start: Date, end: Date): Appointment {
  return {
    resourceType: 'Appointment',
    status: 'booked',
    start: start.toISOString(),
    end: end.toISOString(),
    serviceType: toServiceTypeCodeableConcepts(s),
    participant: [],
  };
}

function calendar(
  s: WithId<Schedule>,
  busy: { appointments?: Appointment[]; slots?: Slot[] } = {}
): AvailabilityShadingCalendar {
  return { schedule: s, appointments: busy.appointments ?? [], slots: busy.slots ?? [] };
}

// A block as "color start-end", plus where it sits across the day's column when it doesn't fill it.
function drawn(shade: AvailabilityShade): string {
  const time = (date: Date): string => `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
  const place = shade.left === 0 && shade.width === 1 ? '' : ` @${shade.left.toFixed(2)}/${shade.width.toFixed(2)}`;
  return `${shade.color ?? shade.kind} ${time(shade.start)}-${time(shade.end)}${place}`;
}

describe('computeAvailabilityShading', () => {
  test('draws one calendar its own windows by visit type color, and no default hours', () => {
    // Follow-up is offered with no hours of its own, so it would inherit 9-5.
    const alvarez: WithId<Schedule> = {
      ...schedule('alvarez', [[newPatient, window('09:00:00', '12:00:00')]]),
      serviceType: toServiceTypeCodeableConcepts(followUp),
    };

    const result = computeAvailabilityShading({
      calendars: [calendar(alvarez)],
      services,
      filters: {},
      range,
      colorOf,
    });

    expect(result.mode).toBe('calendar');
    expect(result.shades.map(drawn)).toEqual(['green 9:00-12:00']);
    expect(result.shades[0]).toMatchObject({ label: 'New Patient', tag: 'Any facility' });
  });

  test('combines calendars for the chosen visit type, after taking each one its own appointments out', () => {
    const alvarez = schedule('alvarez', [[newPatient, window('09:00:00', '12:00:00')]]);
    const bennett = schedule('bennett', [[newPatient, window('12:00:00', '16:00:00')]]);
    // The filter would hide this Follow-up, and Alvarez is still busy for it.
    const hidden = appointment(followUp, at(10), at(10, 30));

    const result = computeAvailabilityShading({
      calendars: [calendar(alvarez, { appointments: [hidden] }), calendar(bennett)],
      services,
      filters: { service: newPatient },
      range,
      colorOf,
    });

    expect(result.mode).toBe('service');
    expect(result.shades.map(drawn)).toEqual(['green 9:00-10:00', 'green 10:30-16:00']);
    expect(result.shades[1].details.map((detail) => detail.schedule.id)).toEqual(['alvarez', 'bennett']);
    // One label a day says what the color is; the rest of the day's blocks go without.
    expect(result.shades.map((shade) => shade.label)).toEqual(['New Patient', undefined]);
  });

  test('keeps a block where another calendar is free through the first one’s appointment', () => {
    const alvarez = schedule('alvarez', [[newPatient, window('09:00:00', '12:00:00')]]);
    const bennett = schedule('bennett', [[newPatient, window('09:00:00', '12:00:00')]]);

    const result = computeAvailabilityShading({
      calendars: [calendar(alvarez, { appointments: [appointment(newPatient, at(10), at(11))] }), calendar(bennett)],
      services,
      filters: { service: newPatient },
      range,
      colorOf,
    });

    expect(result.shades.map(drawn)).toEqual(['green 9:00-12:00']);
  });

  test('takes blocked time out, and leaves cancelled appointments in', () => {
    const alvarez = schedule('alvarez', [[newPatient, window('09:00:00', '12:00:00')]]);
    const timeOff: Slot = {
      resourceType: 'Slot',
      status: 'busy-unavailable',
      schedule: { reference: 'Schedule/alvarez' },
      start: at(11).toISOString(),
      end: at(12).toISOString(),
    };
    const cancelled: Appointment = { ...appointment(newPatient, at(9), at(10)), status: 'cancelled' };

    const result = computeAvailabilityShading({
      calendars: [calendar(alvarez, { appointments: [cancelled], slots: [timeOff] })],
      services,
      filters: {},
      range,
      colorOf,
    });

    expect(result.shades.map(drawn)).toEqual(['green 9:00-11:00']);
  });

  test('draws same-colored visit types as one block and different colors side by side', () => {
    const chen = schedule('chen', [
      [newPatient, window('09:00:00', '11:00:00')],
      [consult, window('10:00:00', '12:30:00')],
      [followUp, window('12:00:00', '14:00:00')],
    ]);

    const result = computeAvailabilityShading({ calendars: [calendar(chen)], services, filters: {}, range, colorOf });

    expect(result.shades.map(drawn)).toEqual(['green 9:00-12:30 @0.00/0.50', 'blue 12:00-14:00 @0.50/0.50']);
    expect(result.shades[0].label).toBe('New Patient, Consult');
  });

  test('collapses the colors past the third into one "+N" block', () => {
    const allAfternoon = window('13:00:00', '16:00:00');
    const chen = schedule(
      'chen',
      [newPatient, followUp, injections, procedures, telehealth].map((s) => [s, allAfternoon])
    );

    const result = computeAvailabilityShading({ calendars: [calendar(chen)], services, filters: {}, range, colorOf });

    expect(result.shades.map(drawn)).toEqual([
      'green 13:00-16:00 @0.00/0.28',
      'blue 13:00-16:00 @0.28/0.28',
      'orange 13:00-16:00 @0.56/0.28',
      'overflow 13:00-16:00 @0.83/0.17',
    ]);
    expect(result.shades.at(-1)?.label).toBe('+2');
  });

  test('leaves out windows at another service facility, and keeps the ones scoped to none', () => {
    const alvarez = schedule('alvarez', [
      [newPatient, window('09:00:00', '12:00:00', riverside)],
      [procedures, window('13:00:00', '15:00:00', northgate)],
      [telehealth, window('15:00:00', '17:00:00')],
    ]);
    const filters = { serviceFacility: { reference: 'Location/riverside' } };

    const result = computeAvailabilityShading({ calendars: [calendar(alvarez)], services, filters, range, colorOf });

    expect(result.shades.map(drawn)).toEqual(['green 9:00-12:00', 'cyan 15:00-17:00']);
    // The facility is already chosen, so the blocks don't repeat it.
    expect(result.shades[0].tag).toBeUndefined();
  });

  test('draws nothing for several calendars with no visit type chosen', () => {
    const alvarez = schedule('alvarez', [[newPatient, window('09:00:00', '12:00:00')]]);
    const bennett = schedule('bennett', [[followUp, window('09:00:00', '12:00:00')]]);

    const result = computeAvailabilityShading({
      calendars: [calendar(alvarez), calendar(bennett)],
      services,
      filters: {},
      range,
      colorOf,
    });

    expect(result).toEqual({ mode: 'off', shades: [] });
  });

  test('draws the default hours of a chosen visit type only for a calendar offering it', () => {
    const offersAll: WithId<Schedule> = { ...schedule('dalton', []), serviceType: [allServiceTypesCodeableConcept()] };
    const offersNone = schedule('nobody', []);
    const filters = { service: newPatient };

    const offered = computeAvailabilityShading({ calendars: [calendar(offersAll)], services, filters, range, colorOf });
    const notOffered = computeAvailabilityShading({
      calendars: [calendar(offersNone)],
      services,
      filters,
      range,
      colorOf,
    });

    expect(offered.shades.map(drawn)).toEqual(['green 9:00-17:00']);
    expect(offered.shades[0].tag).toBe('Any facility · default hours');
    expect(notOffered.shades).toEqual([]);
  });
});
