// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { BotEvent, MedplumClient } from '@medplum/core';
import { Bundle, BundleEntry, Reference, Resource, Schedule, Slot } from '@medplum/fhirtypes';

export interface SetAvailabilityEvent {
  schedule: Reference<Schedule>;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  duration: number;
  daysOfWeek: string[];
  timezoneOffset: number;
}

export async function handler(medplum: MedplumClient, event: BotEvent<SetAvailabilityEvent>): Promise<Bundle> {
  const { schedule, startDate, endDate, startTime, endTime, duration, daysOfWeek, timezoneOffset } = event.input;

  // Basic data validation
  if (duration <= 0) {
    throw new Error('Duration must be a positive number');
  }
  if (new Date(endDate) < new Date(startDate)) {
    throw new Error('End date must be after start date');
  }

  // Map daysOfWeek to their corresponding day numbers
  const dayNumbers = daysOfWeek.map((day) => dayOfWeekMap[day.toLowerCase()]);

  // Bulk create free slots
  const entries: BundleEntry[] = [];

  const end = new Date(endDate);
  let currentDate = new Date(startDate);

  while (currentDate <= end) {
    if (dayNumbers.includes(currentDate.getUTCDay())) {
      const dayStartTime = new Date(currentDate);
      const dayEndTime = new Date(currentDate);

      // Set the start and end times for the day
      const [startHour, startMinute] = startTime.split(':').map(Number);
      const [endHour, endMinute] = endTime.split(':').map(Number);

      dayStartTime.setHours(startHour, startMinute, 0, 0);
      dayEndTime.setHours(endHour, endMinute, 0, 0);

      // Adjust for timezone offset
      dayStartTime.setMinutes(dayStartTime.getMinutes() + timezoneOffset);
      dayEndTime.setMinutes(dayEndTime.getMinutes() + timezoneOffset);

      let currentSlotTime = new Date(dayStartTime);

      // Create slots within the specified time window
      while (currentSlotTime < dayEndTime) {
        const slotEndTime = new Date(currentSlotTime.getTime() + duration * 60000);

        // Ensure that the slot does not exceed the end time
        if (slotEndTime <= dayEndTime) {
          const slot = createFreeSlot(schedule, currentSlotTime, duration);
          entries.push(createEntry(slot));
        }

        // Move to the next slot
        currentSlotTime = new Date(currentSlotTime.getTime() + duration * 60000);
      }
    }
    // Move to the next day
    currentDate = new Date(currentDate.setUTCDate(currentDate.getUTCDate() + 1));
  }

  // Execute batch to create all slots at once
  const responseBundle = await medplum.executeBatch({
    resourceType: 'Bundle',
    type: 'batch',
    entry: entries,
  });
  return responseBundle;
}

const dayOfWeekMap: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

function createEntry(resource: Resource): BundleEntry {
  return {
    resource,
    request: {
      url: resource.resourceType,
      method: 'POST',
    },
  };
}

export function createFreeSlot(schedule: Reference<Schedule>, start: Date, duration: number): Slot {
  return {
    resourceType: 'Slot',
    schedule: schedule,
    start: start.toISOString(),
    end: new Date(start.getTime() + duration * 60000).toISOString(),
    status: 'free',
  };
}
