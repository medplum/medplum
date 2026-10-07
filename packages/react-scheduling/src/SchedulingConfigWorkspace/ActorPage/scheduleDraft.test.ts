// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { getScheduleSchedulingParameters, toServiceTypeCodeableConcepts } from '@medplum/core';
import type { HealthcareService, Schedule } from '@medplum/fhirtypes';
import { describe, expect, test } from 'vitest';
import { setScheduleAvailability } from '../../availability';
import { setScheduleSchedulingParameterValues } from '../../parameterValues';
import { buildScheduleDraft, hasOverrides, scheduleFieldsOf } from './scheduleDraft';

const initialVisit: WithId<HealthcareService> = {
  resourceType: 'HealthcareService',
  id: 'initial-visit',
  name: 'Initial Visit',
  availableTime: [{ daysOfWeek: ['mon'], availableStartTime: '09:00:00', availableEndTime: '17:00:00' }],
};
const followUp: WithId<HealthcareService> = { resourceType: 'HealthcareService', id: 'follow-up', name: 'Follow-up' };
const servicesById = new Map([initialVisit, followUp].map((service) => [service.id, service]));

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

    expect(buildScheduleDraft(stored, initial, initial, servicesById)).toEqual(stored);
  });

  test("switching the hours back to the visit type's clears the override", () => {
    const initial = scheduleFieldsOf(stored, servicesById);
    const offering = initial.offerings[initialVisit.id];

    const draft = buildScheduleDraft(
      stored,
      {
        ...initial,
        offerings: {
          ...initial.offerings,
          [initialVisit.id]: { ...offering, availability: { ...offering.availability, overriding: false } },
        },
      },
      initial,
      servicesById
    );

    expect(getScheduleSchedulingParameters(draft, initialVisit, 'availability')).toEqual([]);
    expect(getScheduleSchedulingParameters(draft, initialVisit, 'bufferAfter')).toHaveLength(1);
  });

  test('turning off bookings writes only active', () => {
    const initial = scheduleFieldsOf(stored, servicesById);

    expect(buildScheduleDraft(stored, { ...initial, active: false }, initial, servicesById)).toEqual({
      ...stored,
      active: false,
    });
  });
});

describe('hasOverrides', () => {
  test('is true when the Schedule sets a parameter or custom hours, and false when it sets nothing', () => {
    const fields = scheduleFieldsOf(stored, servicesById).offerings[initialVisit.id];

    expect(hasOverrides(fields)).toBe(true);
    expect(hasOverrides({ ...fields, parameters: {} })).toBe(true);
    expect(hasOverrides({ ...fields, availability: { ...fields.availability, overriding: false } })).toBe(true);
    expect(hasOverrides(scheduleFieldsOf(stored, servicesById).offerings[followUp.id])).toBe(false);
  });
});
