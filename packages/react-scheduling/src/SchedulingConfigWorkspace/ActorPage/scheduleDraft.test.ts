// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import {
  getScheduleSchedulingParameters,
  serviceTypeIncludesService,
  ServiceTypeReferenceURI,
  toServiceTypeCodeableConcepts,
} from '@medplum/core';
import type { HealthcareService, Location, Schedule } from '@medplum/fhirtypes';
import { describe, expect, test } from 'vitest';
import { setScheduleAvailability } from '../../availability';
import { setScheduleSchedulingParameterValues } from '../../parameterValues';
import { buildScheduleDraft, hasOverrides, newOfferingFields, scheduleFieldsOf, withoutService } from './scheduleDraft';

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

describe('buildScheduleDraft', () => {
  test('changes nothing when nothing was edited', () => {
    const initial = scheduleFieldsOf(stored, servicesById);

    expect(buildScheduleDraft(stored, room, initial, initial, servicesById)).toEqual(stored);
  });

  test('creates no Schedule for an actor offering nothing, and one active Schedule on its first offering', () => {
    const initial = scheduleFieldsOf(undefined, servicesById);
    expect(buildScheduleDraft(undefined, room, initial, initial, servicesById)).toBeUndefined();

    const offering = { ...initial, offerings: { [initialVisit.id]: newOfferingFields(initialVisit) } };
    const created = buildScheduleDraft(undefined, room, offering, initial, servicesById);

    expect(created).toMatchObject({
      resourceType: 'Schedule',
      active: true,
      actor: [{ reference: 'Location/room-3' }],
    });
    expect(created?.serviceType).toEqual(toServiceTypeCodeableConcepts(initialVisit));
    expect(created?.extension).toBeUndefined();
    expect(
      buildScheduleDraft(undefined, { ...room, status: 'inactive' }, offering, initial, servicesById)?.active
    ).toBe(false);
  });

  test('stopping a visit type drops it and every override scoped to it, and leaves the others', () => {
    const initial = scheduleFieldsOf(stored, servicesById);
    const { [initialVisit.id]: _dropped, ...offerings } = initial.offerings;

    const draft = buildScheduleDraft(stored, room, { ...initial, offerings }, initial, servicesById);

    expect(serviceTypeIncludesService(draft?.serviceType, initialVisit)).toBe(false);
    expect(serviceTypeIncludesService(draft?.serviceType, followUp)).toBe(true);
    expect(draft?.extension).toBeUndefined();
  });

  test("switching the hours back to the visit type's clears the override", () => {
    const initial = scheduleFieldsOf(stored, servicesById);
    const offering = initial.offerings[initialVisit.id];

    const draft = buildScheduleDraft(
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
    const initial = scheduleFieldsOf(stored, servicesById);

    expect(buildScheduleDraft(stored, room, { ...initial, active: false }, initial, servicesById)).toEqual({
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

  test('drops the visit type when the Schedule names it by a versioned reference', () => {
    const versioned: Schedule = {
      ...stored,
      serviceType: [
        {
          extension: [
            {
              url: ServiceTypeReferenceURI,
              valueReference: { reference: 'HealthcareService/initial-visit/_history/2' },
            },
          ],
        },
        ...toServiceTypeCodeableConcepts(followUp),
      ],
    };

    expect(withoutService(versioned, initialVisit).serviceType).toEqual(toServiceTypeCodeableConcepts(followUp));
  });
});

describe('hasOverrides', () => {
  test('is true when the Schedule sets a parameter or custom hours, and false when it sets nothing', () => {
    const fields = scheduleFieldsOf(stored, servicesById).offerings[initialVisit.id];

    expect(hasOverrides(fields)).toBe(true);
    expect(hasOverrides({ ...fields, parameters: {} })).toBe(true);
    expect(hasOverrides({ ...fields, availability: { ...fields.availability, overriding: false } })).toBe(true);
    expect(hasOverrides(newOfferingFields(followUp))).toBe(false);
  });
});
