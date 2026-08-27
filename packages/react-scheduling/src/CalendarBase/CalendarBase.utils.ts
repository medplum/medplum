// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BusinessHoursInput } from '@fullcalendar/react';
import { EMPTY, getReferenceString } from '@medplum/core';
import type { Appointment, HealthcareServiceAvailableTime, Slot } from '@medplum/fhirtypes';

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

// Slots that exactly match a booked appointment's start/end are redundant with that
// appointment's event, so they're excluded from the slots returned to the calendar.
export function filterBookedSlots(slots: Slot[], appointments: Appointment[]): Slot[] {
  const appointmentIndex = appointments.reduce<Record<string, Appointment>>((acc, appointment) => {
    (appointment.slot ?? EMPTY).forEach((slotRef) => {
      const key = getReferenceString(slotRef);
      if (key) {
        acc[key] = appointment;
      }
    });
    return acc;
  }, {});

  return slots.filter((slot) => {
    const key = getReferenceString(slot);
    if (key && appointmentIndex[key]) {
      const appointment = appointmentIndex[key];
      if (slot.start === appointment.start && slot.end === appointment.end) {
        return false;
      }
    }
    return true;
  });
}
