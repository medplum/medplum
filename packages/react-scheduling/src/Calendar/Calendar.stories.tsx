// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference } from '@medplum/core';
import type { Appointment, Slot } from '@medplum/fhirtypes';
import { DrAliceSmith, DrAliceSmithSchedule, HomerSimpson } from '@medplum/mock';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { withMockedDate } from '../stories/decorators';
import { Calendar } from './Calendar';

export default {
  title: 'Medplum/Calendar',
  component: Calendar,
  decorators: [withMockedDate],
} as Meta;

export const Basic = (): JSX.Element => {
  const slots = [
    // This slot should not be rendered, as it is shown via the matching Appointment resource
    {
      resourceType: 'Slot',
      id: 'slot-1',
      start: '2020-05-05T17:00:00Z',
      end: '2020-05-05T18:00:00Z',
      status: 'busy',
      schedule: createReference(DrAliceSmithSchedule),
    },

    // This slot should be rendered as blocked time on the calendar
    {
      resourceType: 'Slot',
      id: 'slot-2',
      start: '2020-05-05T18:00:00Z',
      end: '2020-05-05T18:15:00Z',
      status: 'busy-unavailable',
      schedule: createReference(DrAliceSmithSchedule),
      comment: 'Blocked time after appointment',
    },

    // "Free" slots are used to create availability outside of common operating hours
    {
      resourceType: 'Slot',
      id: 'slot-3',
      start: '2020-05-06T14:00:00Z',
      end: '2020-05-06T16:00:00Z',
      status: 'free',
      schedule: createReference(DrAliceSmithSchedule),
      comment: 'Coming in early on wednesday morning',
    },
  ] satisfies Slot[];

  const appointments: Appointment[] = [
    // A "booked" appointment renders as a blue block
    {
      resourceType: 'Appointment',
      id: 'appt-1',
      status: 'booked',
      start: '2020-05-05T17:00:00Z',
      end: '2020-05-05T18:00:00Z',
      slot: [createReference(slots[0]), createReference(slots[1])],
      participant: [
        {
          status: 'accepted',
          actor: createReference(DrAliceSmith),
        },
        {
          status: 'accepted',
          actor: createReference(HomerSimpson),
        },
      ],
    },

    // A "pending" appointment is shown as an outlined block
    {
      resourceType: 'Appointment',
      id: 'appt-2',
      status: 'pending',
      start: '2020-05-08T16:00:00Z',
      end: '2020-05-08T17:00:00Z',
      slot: [],
      participant: [
        {
          status: 'tentative',
          actor: createReference(DrAliceSmith),
        },
        {
          status: 'tentative',
          actor: createReference(HomerSimpson),
        },
      ],
    },

    // A "noshow" appointment has the status displayed after the title
    {
      resourceType: 'Appointment',
      id: 'appt-3',
      status: 'noshow',
      start: '2020-05-04T16:30:00Z',
      end: '2020-05-04T17:15:00Z',
      slot: [],
      participant: [
        {
          status: 'tentative',
          actor: createReference(DrAliceSmith),
        },
        {
          status: 'accepted',
          actor: createReference(HomerSimpson),
        },
      ],
    },
  ];

  return (
    <div style={{ height: 600, padding: '1em' }}>
      <Calendar
        slots={slots}
        appointments={appointments}
        onSelectAppointment={(appointment) => alert(`Selected appointment ${appointment.id}`)}
        onDoubleClickAppointment={(appointment) => alert(`Double-clicked appointment ${appointment.id}`)}
      />
    </div>
  );
};

export const WithAvailabilityOverlay = (): JSX.Element => (
  <div style={{ height: 600, padding: '1em' }}>
    <Calendar
      availableTime={[
        {
          daysOfWeek: ['mon', 'tue', 'wed'],
          availableStartTime: '09:00:00',
          availableEndTime: '17:00:00',
        },
        {
          daysOfWeek: ['fri'],
          allDay: true,
        },
      ]}
    />
  </div>
);
