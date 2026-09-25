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
import { blankWeeklyAvailability } from '../ScheduleAvailabilityEditor/ScheduleAvailabilityEditor.utils';
import { summarizeOffering, summarizeWeek } from './offeringSummary';

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
const calendar: Schedule = { resourceType: 'Schedule', actor: [{ reference: 'Practitioner/dr-smith' }] };

describe('summarizeOffering', () => {
  test("a calendar following the visit type shows the visit type's duration and hours", () => {
    expect(summarizeOffering(initialVisit, calendar)).toBe('60 min · Mon–Fri 9:00 AM–5:00 PM');
  });

  test("a calendar's own duration and hours win, and custom hours say so", () => {
    const overriding = setScheduleAvailability(
      setScheduleSchedulingParameterValues(calendar, initialVisit, { duration: 45 }),
      initialVisit,
      [{ daysOfWeek: ['tue', 'thu'], availableStartTime: '08:00:00', availableEndTime: '12:00:00' }]
    );

    expect(summarizeOffering(initialVisit, overriding)).toBe('45 min · Custom hours: Tue, Thu 8:00 AM–12:00 PM');
  });

  test('says when there is no duration or no hours', () => {
    const bare: WithId<HealthcareService> = { resourceType: 'HealthcareService', id: 'bare', name: 'Walk-in' };

    expect(summarizeOffering(bare, calendar)).toBe('No duration · Any time (no hours set)');
  });
});

describe('summarizeWeek', () => {
  test('groups the days that share hours, and collapses runs of days', () => {
    const weekly = blankWeeklyAvailability();
    for (const day of ['mon', 'tue', 'wed'] as const) {
      weekly[day] = { available: true, ranges: [{ start: 540, end: 1020 }] };
    }
    weekly.sat = { available: true, ranges: [{ start: 540, end: 720 }] };

    expect(summarizeWeek(weekly)).toBe('Mon–Wed 9:00 AM–5:00 PM; Sat 9:00 AM–12:00 PM');
    expect(summarizeWeek(blankWeeklyAvailability())).toBe('No hours');
  });
});
