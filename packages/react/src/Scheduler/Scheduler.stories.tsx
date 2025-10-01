// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, WithId } from '@medplum/core';
import { Period, Schedule, Slot } from '@medplum/fhirtypes';
import { DrAliceSmithSchedule, ExampleQuestionnaire } from '@medplum/mock';
import { useMedplum } from '@medplum/react-hooks';
import { Meta } from '@storybook/react';
import { JSX, useEffect, useState } from 'react';
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
  const medplum = useMedplum();

  const [drBobSchedule, setDrBobSchedule] = useState<WithId<Schedule> | undefined>();
  useEffect(() => {
    medplum.createResource({
      resourceType: 'Practitioner',
      id: 'dr-bob',
      name: [
        {
          given: ['Bob'],
          family: 'Smith',
        },
      ],
    });

    const drBobSchedule: WithId<Schedule> = {
      resourceType: 'Schedule',
      id: 'dr-bob-schedule',
      actor: [
        {
          reference: 'Practitioner/dr-bob',
          display: 'Dr. Bob Smith',
        },
      ],
    };

    const schedule = createReference(drBobSchedule);
    const slotDate = new Date();
    for (let day = 0; day < 60; day++) {
      for (const hour of [9, 10, 11, 13, 14, 15]) {
        slotDate.setHours(hour, 0, 0, 0);
        medplum.createResource({
          resourceType: 'Slot',
          id: `slot-${day}-${hour}-bob`,
          status: 'free',
          start: slotDate.toISOString(),
          end: new Date(slotDate.getTime() + 60 * 60 * 1000).toISOString(),
          schedule,
        });
      }
      slotDate.setDate(slotDate.getDate() + 1);
    }

    setDrBobSchedule(drBobSchedule);

    // Optionally, you could also create slots for Dr. Bob here if needed
    // For now, just set the schedule as in alice.ts
  }, []);

  if (!drBobSchedule) {
    return <div>Loading...</div>;
  }

  return (
    <Document>
      <Scheduler schedule={[DrAliceSmithSchedule, drBobSchedule]} questionnaire={ExampleQuestionnaire} />
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

    while (currentDate.getTime() <= periodEnd.getTime()) {
      // Skip weekends (Saturday = 6, Sunday = 0)
      if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
        // Generate morning slots (9 AM, 10 AM, 11 AM)
        for (const hour of [9, 10, 11]) {
          const slotStart = new Date(currentDate);
          slotStart.setHours(hour, 0, 0, 0);

          const slotEnd = new Date(slotStart);
          slotEnd.setHours(hour + 1, 0, 0, 0);

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
          slotStart.setHours(hour, 0, 0, 0);

          const slotEnd = new Date(slotStart);
          slotEnd.setHours(hour + 1, 0, 0, 0);

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
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return slots;
  };
  return (
    <Document>
      <Scheduler schedule={customSlotSearch} questionnaire={ExampleQuestionnaire} />
    </Document>
  );
};
