// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { WithId } from '@medplum/core';
import { Period, Schedule, Slot } from '@medplum/fhirtypes';
import { DrAliceSmithSchedule, ExampleQuestionnaire } from '@medplum/mock';
import { Meta } from '@storybook/react';
import { JSX } from 'react';
import { Document } from '../Document/Document';
import { withMockedDate } from '../stories/decorators';
import { Scheduler, SlotSearchFunction } from './Scheduler';

export default {
  title: 'Medplum/Scheduler',
  component: Scheduler,
  decorators: [withMockedDate],
} as Meta;

export const Basic = (): JSX.Element => {
  return (
    <Document>
      <Scheduler schedule={DrAliceSmithSchedule} questionnaire={ExampleQuestionnaire} />
    </Document>
  );
};

export const MultipleSchedules = (): JSX.Element => {
  // Create a second schedule for the array story
  const DrBobSchedule: WithId<Schedule> = {
    ...DrAliceSmithSchedule,
    id: 'dr-bob-schedule',
    actor: [{ reference: 'Practitioner/dr-bob', display: 'Dr. Bob Jones' }],
  };

  return (
    <Document>
      <Scheduler schedule={[DrAliceSmithSchedule, DrBobSchedule]} questionnaire={ExampleQuestionnaire} />
    </Document>
  );
};

export const CustomSlotSearch = (): JSX.Element => {
  // Create a custom slot search function that generates dynamic slots
  const customSlotSearch: SlotSearchFunction = async (period: Period): Promise<Slot[]> => {
    // Generate slots dynamically based on the requested period
    const slots: Slot[] = [];
    const periodStart = new Date(period.start as string);
    const periodEnd = new Date(period.end as string);

    // Generate slots for each day in the period
    const currentDate = new Date(periodStart);
    let slotId = 1;

    while (currentDate <= periodEnd) {
      // Skip weekends (Saturday = 6, Sunday = 0)
      if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
        // Generate morning slots (9 AM, 10 AM, 11 AM)
        for (const hour of [9, 10, 11]) {
          const slotStart = new Date(currentDate);
          slotStart.setUTCHours(hour, 0, 0, 0);

          const slotEnd = new Date(slotStart);
          slotEnd.setUTCHours(hour + 1, 0, 0, 0);

          slots.push({
            resourceType: 'Slot',
            id: `custom-slot-${slotId++}`,
            schedule: { reference: 'Schedule/custom' },
            status: 'free',
            start: slotStart.toISOString(),
            end: slotEnd.toISOString(),
          });
        }

        // Generate afternoon slots (2 PM, 3 PM, 4 PM)
        for (const hour of [14, 15, 16]) {
          const slotStart = new Date(currentDate);
          slotStart.setUTCHours(hour, 0, 0, 0);

          const slotEnd = new Date(slotStart);
          slotEnd.setUTCHours(hour + 1, 0, 0, 0);

          slots.push({
            resourceType: 'Slot',
            id: `custom-slot-${slotId++}`,
            schedule: { reference: 'Schedule/custom' },
            status: 'free',
            start: slotStart.toISOString(),
            end: slotEnd.toISOString(),
          });
        }
      }

      // Move to next day
      currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    }

    return slots;
  };
  return (
    <Document>
      <Scheduler schedule={customSlotSearch} questionnaire={ExampleQuestionnaire} />
    </Document>
  );
};
