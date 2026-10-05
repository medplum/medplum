// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference } from '@medplum/core';
import type { Device, HealthcareServiceAvailableTime, Location, Schedule } from '@medplum/fhirtypes';
import { DrAliceSmith, DrAliceSmithSchedule, HomerSimpson, MargeSimpson } from '@medplum/mock';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { withMockedDate } from '../stories/decorators';
import type { MultiCalendarSource } from './MultiCalendar';
import { MultiCalendar } from './MultiCalendar';

export default {
  title: 'Medplum/MultiCalendar',
  component: MultiCalendar,
  decorators: [withMockedDate],
} as Meta;

const roomOne = {
  resourceType: 'Location',
  id: 'location-room-1',
} satisfies Location;

const roomOneSchedule = {
  resourceType: 'Schedule',
  id: 'schedule-room-1',
  actor: [createReference(roomOne)],
  extension: [
    // A Schedule can set a display color in an extension
    {
      url: 'https://medplum.com/fhir/StructureDefinition/SchedulingColor',
      valueString: 'grape',
    },
  ],
} satisfies Schedule;

const ultrasoundMachine = {
  resourceType: 'Device',
  id: 'ultrasound-machine-1',
} satisfies Device;

const ultrasoundMachineSchedule = {
  resourceType: 'Schedule',
  id: 'schedule-ultrasound-machine-1',
  actor: [createReference(ultrasoundMachine)],
  extension: [
    {
      url: 'https://medplum.com/fhir/StructureDefinition/SchedulingColor',
      valueString: 'maroon', // Display colors not present in the theme are ignored
    },
  ],
} satisfies Schedule;

export const Basic = (): JSX.Element => {
  const sources: MultiCalendarSource[] = [
    {
      schedule: DrAliceSmithSchedule,
      slots: [
        // This slot should not be rendered, as it is shown via the matching Appointment resource
        {
          resourceType: 'Slot',
          id: 'slot-1',
          start: '2020-05-05T17:00:00Z',
          end: '2020-05-05T18:00:00Z',
          status: 'busy',
          schedule: createReference(DrAliceSmithSchedule),
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
      ],
      appointments: [
        {
          resourceType: 'Appointment',
          id: 'appt-1',
          status: 'booked',
          start: '2020-05-05T17:00:00Z',
          end: '2020-05-05T18:00:00Z',
          slot: [{ reference: 'Slot/slot-1' }, { reference: 'Slot/slot-2' }],
          participant: [
            {
              status: 'accepted',
              actor: createReference(DrAliceSmith),
            },
            {
              status: 'accepted',
              actor: createReference(roomOne),
            },
            {
              status: 'accepted',
              actor: createReference(HomerSimpson),
            },
          ],
        },
        {
          resourceType: 'Appointment',
          id: 'appt-3',
          status: 'proposed',
          start: '2020-05-07T16:00:00Z',
          end: '2020-05-05T17:00:00Z',
          slot: [],
          participant: [
            {
              status: 'accepted',
              actor: createReference(DrAliceSmith),
            },
          ],
        },
      ],
    },
    {
      schedule: roomOneSchedule,
      slots: [
        // This slot should not be rendered, as it is shown via the matching Appointment resource
        {
          resourceType: 'Slot',
          id: 'slot-r1-1',
          start: '2020-05-05T17:00:00Z',
          end: '2020-05-05T18:00:00Z',
          status: 'busy',
          schedule: createReference(roomOneSchedule),
        },

        // This slot should be rendered as blocked time on the calendar
        {
          resourceType: 'Slot',
          id: 'slot-r1-2',
          start: '2020-05-05T18:00:00Z',
          end: '2020-05-05T18:15:00Z',
          status: 'busy-unavailable',
          schedule: createReference(roomOneSchedule),
          comment: 'Blocked time after appointment',
        },
      ],
      appointments: [
        {
          resourceType: 'Appointment',
          id: 'appt-1',
          status: 'booked',
          start: '2020-05-05T17:00:00Z',
          end: '2020-05-05T18:00:00Z',
          slot: [{ reference: 'Slot/slot-r1-1' }],
          participant: [
            {
              status: 'accepted',
              actor: createReference(DrAliceSmith),
            },
            {
              status: 'accepted',
              actor: createReference(roomOne),
            },
            {
              status: 'accepted',
              actor: createReference(HomerSimpson),
            },
          ],
        },
        {
          resourceType: 'Appointment',
          id: 'appt-2',
          status: 'pending',
          start: '2020-05-05T16:00:00Z',
          end: '2020-05-05T17:00:00Z',
          slot: [],
          participant: [
            {
              status: 'accepted',
              actor: createReference(roomOne),
            },
            {
              status: 'accepted',
              actor: createReference(HomerSimpson),
            },
          ],
        },
        {
          resourceType: 'Appointment',
          id: 'appt-4',
          status: 'noshow',
          start: '2020-05-04T16:15:00Z',
          end: '2020-05-04T17:00:00Z',
          slot: [],
          participant: [
            {
              status: 'accepted',
              actor: createReference(roomOne),
            },
            {
              status: 'accepted',
              actor: createReference(MargeSimpson),
            },
          ],
        },
      ],
    },
    {
      schedule: ultrasoundMachineSchedule,
      slots: [],
      appointments: [
        {
          resourceType: 'Appointment',
          id: 'appt-5',
          status: 'arrived',
          start: '2020-05-04T17:30:00Z',
          end: '2020-05-04T18:15:00Z',
          slot: [],
          participant: [
            {
              status: 'accepted',
              actor: createReference(ultrasoundMachine),
            },
          ],
        },
      ],
    },
  ];

  return (
    <div style={{ height: 600, padding: '1em' }}>
      <MultiCalendar
        sources={sources}
        onSelectAppointment={(appointment, schedule) =>
          alert(`Selected Appointment/${appointment.id} from Schedule/${schedule?.id}`)
        }
        onDoubleClickAppointment={(appointment, schedule) =>
          alert(`Double-clicked Appointment/${appointment.id} from Schedule/${schedule?.id}`)
        }
      />
    </div>
  );
};

const sampleSources: MultiCalendarSource[] = [
  {
    schedule: DrAliceSmithSchedule,
    slots: [
      {
        resourceType: 'Slot',
        id: 'slot-1',
        start: '2020-05-07T15:00:00Z',
        end: '2020-05-07T16:00:00Z',
        status: 'free',
        schedule: createReference(DrAliceSmithSchedule),
        comment: 'Coming in early',
      },
    ],
    appointments: [
      {
        resourceType: 'Appointment',
        id: 'appt-1',
        status: 'booked',
        start: '2020-05-06T17:30:00Z',
        end: '2020-05-06T18:30:00Z',
        participant: [
          {
            status: 'accepted',
            actor: createReference(DrAliceSmith),
          },
          {
            status: 'accepted',
            actor: createReference(MargeSimpson),
          },
        ],
      },
      {
        resourceType: 'Appointment',
        id: 'appt-3',
        status: 'proposed',
        start: '2020-05-07T16:00:00Z',
        end: '2020-05-05T17:00:00Z',
        slot: [],
        participant: [
          {
            status: 'accepted',
            actor: createReference(DrAliceSmith),
          },
        ],
      },
    ],
  },
  {
    schedule: roomOneSchedule,
    color: 'green',
    slots: [
      {
        resourceType: 'Slot',
        id: 'slot-r1-2',
        start: '2020-05-05T19:00:00Z',
        end: '2020-05-05T19:20:00Z',
        status: 'busy-unavailable',
        schedule: createReference(roomOneSchedule),
        comment: 'Blocked time after appointment',
      },
    ],
    appointments: [
      {
        resourceType: 'Appointment',
        id: 'appt-2',
        status: 'pending',
        start: '2020-05-05T18:00:00Z',
        end: '2020-05-05T19:00:00Z',
        slot: [],
        participant: [
          {
            status: 'accepted',
            actor: createReference(roomOne),
          },
          {
            status: 'accepted',
            actor: createReference(HomerSimpson),
          },
        ],
      },
    ],
  },
];

export const WithHoursOfAvailability = (): JSX.Element => {
  const availableTime: HealthcareServiceAvailableTime[] = [
    // 9-5 am availability on Mondays, Tuesdays, Wednesdays
    {
      daysOfWeek: ['mon', 'tue', 'wed'],
      availableStartTime: '09:00:00',
      availableEndTime: '17:00:00',
    },

    // 24hour availability on Fridays
    {
      daysOfWeek: ['fri'],
      allDay: true,
    },
  ];

  return (
    <div style={{ height: 600, padding: '1em' }}>
      <MultiCalendar
        sources={sampleSources}
        onSelectAppointment={(appointment, schedule) =>
          alert(`Selected Appointment/${appointment.id} from Schedule/${schedule?.id}`)
        }
        onDoubleClickAppointment={(appointment, schedule) =>
          alert(`Double-clicked Appointment/${appointment.id} from Schedule/${schedule?.id}`)
        }
        availableTime={availableTime}
      />
    </div>
  );
};
