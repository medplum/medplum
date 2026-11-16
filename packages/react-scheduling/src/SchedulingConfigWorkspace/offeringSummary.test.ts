// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { HealthcareService, Schedule } from '@medplum/fhirtypes';
import { describe, expect, test } from 'vitest';
import { setScheduleAvailability } from '../availability';
import {
  setHealthcareServiceSchedulingParameterValues,
  setScheduleSchedulingParameterValues,
} from '../parameterValues';
import { summarizeOffering } from './offeringSummary';

const initialVisit = setHealthcareServiceSchedulingParameterValues(
  {
    resourceType: 'HealthcareService',
    id: 'initial-visit',
    name: 'Initial Visit',
    availableTime: [
      { daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri'], availableStartTime: '09:00:00', availableEndTime: '17:00:00' },
    ],
  } satisfies WithId<HealthcareService>,
  { duration: 60 }
);
const schedule: Schedule = { resourceType: 'Schedule', actor: [{ reference: 'Practitioner/dr-smith' }] };

describe('summarizeOffering', () => {
  test("a Schedule's own duration and hours win", () => {
    const overriding = setScheduleAvailability(
      setScheduleSchedulingParameterValues(schedule, initialVisit, { duration: 45 }),
      initialVisit,
      [{ daysOfWeek: ['tue', 'thu'], availableStartTime: '08:00:00', availableEndTime: '12:00:00' }]
    );

    expect(summarizeOffering(initialVisit, overriding)).toBe('45 min · Custom hours');
  });

  test("a Schedule that sets no hours of its own follows the visit type's", () => {
    expect(summarizeOffering(initialVisit, schedule)).toBe("60 min · Visit type's default hours");
  });

  test('says when there is no duration or no hours', () => {
    const bare: WithId<HealthcareService> = { resourceType: 'HealthcareService', id: 'bare', name: 'Walk-in' };

    expect(summarizeOffering(bare, schedule)).toBe('No duration · No hours set');
  });
});
