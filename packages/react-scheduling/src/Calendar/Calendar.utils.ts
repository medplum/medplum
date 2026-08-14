// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BusinessHoursInput } from '@fullcalendar/react';
import type { HealthcareServiceAvailableTime } from '@medplum/fhirtypes';

const DayIndexer = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function availableTimeToBusinessHoursEntry(availableTime: HealthcareServiceAvailableTime): BusinessHoursInput[] {
  const startTime = availableTime.allDay ? '00:00:00' : availableTime.availableStartTime;
  const endTime = availableTime.allDay ? '24:00:00' : availableTime.availableEndTime;

  if (!startTime || !endTime || !availableTime.daysOfWeek) {
    return [];
  }

  const daysOfWeek = availableTime.daysOfWeek.map((day) => DayIndexer.indexOf(day));

  // When endTime is less than or equal to startTime, the interval wraps past
  // midnight into the following day. Split it into two entries: startTime →
  // midnight on the given days, and midnight → endTime on the subsequent days.
  if (endTime <= startTime) {
    return [
      {
        daysOfWeek,
        startTime,
        endTime: '24:00:00',
      },
      {
        daysOfWeek: daysOfWeek.map((day) => (day + 1) % 7),
        startTime: '00:00:00',
        endTime,
      },
    ];
  }

  return [
    {
      daysOfWeek,
      startTime,
      endTime,
    },
  ];
}
