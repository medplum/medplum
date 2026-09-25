// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import {
  getScheduleSchedulingParameters,
  serviceTypeIncludesService,
  toServiceTypeCodeableConcepts,
} from '@medplum/core';
import type { HealthcareService, Location, Schedule } from '@medplum/fhirtypes';
import { describe, expect, test } from 'vitest';
import { setScheduleAvailability } from '../../availability';
import { setScheduleSchedulingParameterValues } from '../../parameterValues';
import { buildCalendar, calendarFieldsOf, describeOverrides, newOfferingFields, withoutService } from './calendarDraft';

const initialVisit: WithId<HealthcareService> = {
  resourceType: 'HealthcareService',
  id: 'initial-visit',
  name: 'Initial Visit',
  availableTime: [{ daysOfWeek: ['mon'], availableStartTime: '09:00:00', availableEndTime: '17:00:00' }],
};
const followUp: WithId<HealthcareService> = { resourceType: 'HealthcareService', id: 'follow-up', name: 'Follow-up' };
const servicesById = new Map([initialVisit, followUp].map((service) => [service.id, service]));
const room: WithId<Location> = { resourceType: 'Location', id: 'room-3', name: 'Room 3' };

const stored: WithId<Schedule> = setScheduleAvailability(
  setScheduleSchedulingParameterValues(
    {
      resourceType: 'Schedule',
      id: 'schedule-1',
      active: true,
      actor: [{ reference: 'Location/room-3' }],
      serviceType: [...toServiceTypeCodeableConcepts(initialVisit), ...toServiceTypeCodeableConcepts(followUp)],
    },
    initialVisit,
    { bufferAfter: 10 }
  ),
  initialVisit,
  [{ daysOfWeek: ['tue'], availableStartTime: '08:00:00', availableEndTime: '12:00:00' }]
) as WithId<Schedule>;

describe('buildCalendar', () => {
  test('changes nothing when nothing was edited', () => {
    const initial = calendarFieldsOf(stored, servicesById);

    expect(buildCalendar(stored, room, initial, initial, servicesById)).toEqual(stored);
  });

  test('creates no calendar for an actor offering nothing, and one active calendar on its first offering', () => {
    const initial = calendarFieldsOf(undefined, servicesById);
    expect(buildCalendar(undefined, room, initial, initial, servicesById)).toBeUndefined();

    const offering = {
      ...initial,
      offered: [initialVisit.id],
      offerings: { [initialVisit.id]: newOfferingFields(initialVisit) },
    };
    const created = buildCalendar(undefined, room, offering, initial, servicesById);

    expect(created).toMatchObject({
      resourceType: 'Schedule',
      active: true,
      actor: [{ reference: 'Location/room-3' }],
    });
    expect(created?.serviceType).toEqual(toServiceTypeCodeableConcepts(initialVisit));
    expect(created?.extension).toBeUndefined();
  });

  test('stopping a visit type drops it and every override scoped to it, and leaves the others', () => {
    const initial = calendarFieldsOf(stored, servicesById);
    const { [initialVisit.id]: _dropped, ...offerings } = initial.offerings;

    const draft = buildCalendar(stored, room, { ...initial, offered: [followUp.id], offerings }, initial, servicesById);

    expect(serviceTypeIncludesService(draft?.serviceType, initialVisit)).toBe(false);
    expect(serviceTypeIncludesService(draft?.serviceType, followUp)).toBe(true);
    expect(draft?.extension).toBeUndefined();
  });

  test("switching the hours back to the visit type's clears the override", () => {
    const initial = calendarFieldsOf(stored, servicesById);
    const offering = initial.offerings[initialVisit.id];

    const draft = buildCalendar(
      stored,
      room,
      {
        ...initial,
        offerings: {
          ...initial.offerings,
          [initialVisit.id]: { ...offering, availability: newOfferingFields(initialVisit).availability },
        },
      },
      initial,
      servicesById
    ) as Schedule;

    expect(getScheduleSchedulingParameters(draft, initialVisit, 'availability')).toEqual([]);
    expect(getScheduleSchedulingParameters(draft, initialVisit, 'bufferAfter')).toHaveLength(1);
  });

  test('turning off bookings writes only active', () => {
    const initial = calendarFieldsOf(stored, servicesById);

    expect(buildCalendar(stored, room, { ...initial, active: false }, initial, servicesById)).toEqual({
      ...stored,
      active: false,
    });
  });
});

describe('withoutService', () => {
  test('drops a SchedulingParameters entry scoped to the service even when it holds parameters this package does not edit', () => {
    const withUnknown: Schedule = {
      ...stored,
      extension: [
        ...(stored.extension ?? []),
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [
            { url: 'service', valueReference: { reference: 'HealthcareService/initial-visit/_history/2' } },
            { url: 'somethingNew', valueString: 'x' },
          ],
        },
      ],
    };

    expect(withoutService(withUnknown, initialVisit).extension).toBeUndefined();
  });
});

describe('describeOverrides', () => {
  test('names each parameter the calendar sets, and custom hours', () => {
    const fields = calendarFieldsOf(stored, servicesById).offerings[initialVisit.id];

    expect(describeOverrides(fields)).toEqual(['Buffer after', 'custom hours']);
    expect(describeOverrides(newOfferingFields(followUp))).toEqual([]);
  });
});
