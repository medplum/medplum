// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { DEFAULT_THEME } from '@mantine/core';
import type { WithId } from '@medplum/core';
import {
  createReference,
  getReferenceString,
  SchedulingScheduleColorURI,
  ServiceTypeReferenceURI,
  setPrimaryProvider,
} from '@medplum/core';
import type { Appointment, Schedule, Slot } from '@medplum/fhirtypes';
import { DrAliceSmith, DrAliceSmithSchedule, MockClient } from '@medplum/mock';
import { beforeEach, describe, expect, test } from 'vitest';
import { renderWithMedplum, screen, userEvent, waitFor, within } from '../test-utils/render';
import type { MultiCalendarSource } from './MultiCalendar';
import { MultiCalendar } from './MultiCalendar';

// FullCalendar renders each event source's resolved color as a CSS variable
// on the event element's nearest ancestor with the "event" class.
function getEventColor(text: string | RegExp): string | undefined {
  const el = screen.getByText(text).closest<HTMLElement>('.event');
  const match = el?.getAttribute('style')?.match(/--fc-event-color:\s*([^;]+);/);
  return match?.[1];
}

describe('MultiCalendar', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
  });

  // Use today's date to ensure appointments show in visible range
  const now = new Date();
  const baseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0);

  // This is a thin wrapper around CalendarBase, so we just test the happy path here.
  test('rendering', async () => {
    const appointments: Appointment[] = [
      {
        resourceType: 'Appointment',
        id: 'test-appointment-1',
        status: 'booked',
        start: new Date(baseDate.getTime()).toISOString(),
        end: new Date(baseDate.getTime() + 30 * 60 * 1000).toISOString(),
        participant: [
          {
            actor: {
              reference: 'Patient/123',
              display: 'John Doe',
            },
            status: 'accepted',
          },
          {
            actor: createReference(DrAliceSmith),
            status: 'accepted',
          },
        ],
      },
      {
        resourceType: 'Appointment',
        id: 'test-appointment-2',
        status: 'checked-in',
        start: new Date(baseDate.getTime() + 90 * 60 * 1000).toISOString(),
        end: new Date(baseDate.getTime() + 120 * 60 * 1000).toISOString(),
        participant: [
          {
            actor: {
              reference: 'Patient/124',
              display: 'Jane Williams',
            },
            status: 'accepted',
          },
          {
            actor: createReference(DrAliceSmith),
            status: 'accepted',
          },
        ],
      },
    ];

    const slots: Slot[] = [
      {
        resourceType: 'Slot',
        id: 'test-slot-1',
        status: 'free',
        schedule: createReference(DrAliceSmithSchedule),
        start: new Date(baseDate.getTime() - 90 * 60 * 1000).toISOString(),
        end: new Date(baseDate.getTime()).toISOString(),
      },
      {
        resourceType: 'Slot',
        id: 'test-slot-2',
        status: 'busy-unavailable',
        schedule: createReference(DrAliceSmithSchedule),
        start: new Date(baseDate.getTime() + 30 * 60 * 1000).toISOString(),
        end: new Date(baseDate.getTime() + 40 * 60 * 1000).toISOString(),
      },
    ];

    const sources: MultiCalendarSource[] = [{ schedule: DrAliceSmithSchedule, appointments, slots }];
    renderWithMedplum(<MultiCalendar sources={sources} />, medplum);
    expect(screen.getByText(/John Doe/)).toBeInTheDocument();
    expect(screen.getByText(/Jane Williams/)).toBeInTheDocument();
    expect(screen.getByText(/Available/)).toBeInTheDocument();
    expect(screen.getByText(/Available/).querySelector('svg')).toBeNull();
    expect(screen.getByText(/Blocked/)).toBeInTheDocument();
    expect(screen.getByText(/Blocked/).querySelector('svg')).toHaveClass('tabler-icon-square-rounded-x-filled');
    // A week says when a slot is by where it is drawn, so the line under its title names whose time it is.
    const blocked = screen.getByText(/Blocked/).closest<HTMLElement>('.event') as HTMLElement;
    expect(await within(blocked).findByText('Alice Smith')).toBeInTheDocument();
  });

  test('names everyone a slot holds time for, and gives its time when its schedule is unknown', async () => {
    const room = await medplum.createResource({ resourceType: 'Location', name: 'Exam Room A' });
    const schedule: WithId<Schedule> = {
      ...DrAliceSmithSchedule,
      actor: [createReference(DrAliceSmith), createReference(room)],
    };
    const held: Slot = {
      resourceType: 'Slot',
      id: 'test-slot-held',
      status: 'busy-unavailable',
      schedule: createReference(schedule),
      start: new Date(baseDate.getTime()).toISOString(),
      end: new Date(baseDate.getTime() + 30 * 60 * 1000).toISOString(),
    };
    const unknown: Slot = {
      resourceType: 'Slot',
      id: 'test-slot-unknown',
      status: 'free',
      schedule: { reference: 'Schedule/unknown' },
      start: new Date(baseDate.getTime() + 60 * 60 * 1000).toISOString(),
      end: new Date(baseDate.getTime() + 90 * 60 * 1000).toISOString(),
    };
    renderWithMedplum(
      <MultiCalendar
        sources={[
          { schedule, appointments: [], slots: [held] },
          { appointments: [], slots: [unknown] },
        ]}
      />,
      medplum
    );

    const blocked = within(screen.getByText('Blocked').closest('.event') as HTMLElement);
    const names = (await blocked.findByText('Exam Room A')).parentElement as HTMLElement;
    await waitFor(() => expect(names).toHaveTextContent('Alice Smith, Exam Room A'));

    // With no schedule to name anyone from, the line under the title falls back to the slot's time.
    const available = within(screen.getByText('Available').closest('.event') as HTMLElement);
    expect(available.getByText(/11(:00)?\s?am/i)).toBeInTheDocument();
    expect(available.queryByText('Alice Smith')).not.toBeInTheDocument();
  });

  test('titles an appointment by its service type, over its patient on a week and beside its time on a month', async () => {
    const service = await medplum.createResource({ resourceType: 'HealthcareService', name: 'Ultrasound imaging' });
    const appointment: Appointment = {
      resourceType: 'Appointment',
      id: 'test-appointment-1',
      status: 'booked',
      start: new Date(baseDate.getTime()).toISOString(),
      end: new Date(baseDate.getTime() + 30 * 60 * 1000).toISOString(),
      serviceType: [
        {
          // Stale: the event names the service type as its HealthcareService is named now.
          text: 'Imaging',
          extension: [{ url: ServiceTypeReferenceURI, valueReference: { reference: getReferenceString(service) } }],
        },
        // A procedure code, which is not what the visit is for.
        { text: 'Abdominal ultrasound' },
      ],
      participant: [
        { actor: { reference: 'Patient/123', display: 'John Doe' }, status: 'accepted' },
        { actor: createReference(DrAliceSmith), status: 'accepted' },
      ],
    };
    // Held with no service type, an hour later.
    const untyped: Appointment = {
      resourceType: 'Appointment',
      id: 'test-appointment-2',
      status: 'booked',
      start: new Date(baseDate.getTime() + 60 * 60 * 1000).toISOString(),
      end: new Date(baseDate.getTime() + 90 * 60 * 1000).toISOString(),
      participant: [
        { actor: { reference: 'Patient/456', display: 'Jane Roe' }, status: 'accepted' },
        { actor: createReference(DrAliceSmith), status: 'accepted' },
      ],
    };
    const time = /10(:00)?\s?am/i;
    renderWithMedplum(<MultiCalendar sources={[{ appointments: [appointment, untyped], slots: [] }]} />, medplum);

    // Where the event sits on the week says when it is, so the line under its service type names
    // its patient rather than the time. The grid labels its hours with the same `10am`, so only
    // the event itself is looked in.
    const event = within(screen.getByText('John Doe').closest('.event') as HTMLElement);
    expect(await event.findByText('Ultrasound imaging')).toBeInTheDocument();
    expect(event.queryByText(time)).not.toBeInTheDocument();
    expect(event.queryByText('Alice Smith')).not.toBeInTheDocument();
    // One with no service type says so where the service type would be, keeping its patient under it.
    const untypedEvent = within(screen.getByText('Jane Roe').closest('.event') as HTMLElement);
    expect(untypedEvent.getByText('Appointment (no service type)')).toBeInTheDocument();

    // A month has no hours to sit in, so there the event says when it is itself, with room for
    // the service type beside it and not the patient.
    await userEvent.click(screen.getByText('Month'));
    const monthEvent = within((await screen.findByText('Ultrasound imaging')).closest('.event') as HTMLElement);
    expect(monthEvent.getByText(time)).toBeInTheDocument();
    expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
    expect(screen.getByText('Appointment (no service type)')).toBeInTheDocument();
    expect(screen.queryByText('Jane Roe')).not.toBeInTheDocument();
  });

  test('hovering an appointment names its service and everyone it is held on, marking the primary provider', async () => {
    const service = await medplum.createResource({ resourceType: 'HealthcareService', name: 'Ultrasound imaging' });
    // Held by bare reference, so every name has to be looked up rather than read off it.
    const device = await medplum.createResource({
      resourceType: 'Device',
      deviceName: [{ name: 'Ultrasound 1', type: 'user-friendly-name' }],
    });
    const room = await medplum.createResource({ resourceType: 'Location', name: 'Exam Room A' });
    const practitioner = { reference: getReferenceString(DrAliceSmith) };
    const appointment: Appointment = {
      resourceType: 'Appointment',
      id: 'test-appointment-1',
      status: 'booked',
      start: new Date(baseDate.getTime()).toISOString(),
      end: new Date(baseDate.getTime() + 30 * 60 * 1000).toISOString(),
      serviceType: [
        {
          // Stale: the event names the service type as its HealthcareService is named now.
          text: 'Imaging',
          extension: [{ url: ServiceTypeReferenceURI, valueReference: { reference: getReferenceString(service) } }],
        },
        // A procedure code, which is not what the visit is for.
        { text: 'Abdominal ultrasound' },
      ],
      participant: setPrimaryProvider(
        [
          { actor: { reference: 'Patient/123', display: 'John Doe' }, status: 'accepted' },
          { actor: practitioner, status: 'accepted' },
          { actor: { reference: getReferenceString(device) }, status: 'accepted' },
          { actor: { reference: getReferenceString(room) }, status: 'accepted' },
          // A second patient, the provider again in another role, and a role no one fills yet.
          { actor: { reference: 'Patient/456', display: 'Jane Roe' }, status: 'accepted' },
          { actor: practitioner, type: [{ text: 'Attender' }], status: 'accepted' },
          { type: [{ text: 'Interpreter' }], status: 'needs-action' },
        ],
        practitioner
      ),
    };
    renderWithMedplum(<MultiCalendar sources={[{ appointments: [appointment], slots: [] }]} />, medplum);

    // Who the visit is held on waits for the card.
    expect(screen.queryByText('Exam Room A')).not.toBeInTheDocument();

    await userEvent.hover(screen.getByText('John Doe'));

    const primary = await screen.findByText('Primary');
    const card = within(primary.closest('.mantine-Popover-dropdown') as HTMLElement);
    // Its status sits beside the patient it is titled by.
    expect(card.getByText('John Doe').closest('.mantine-Group-root')).toHaveTextContent('booked');
    expect((await card.findByText('Ultrasound imaging')).parentElement).toHaveTextContent(
      /^Ultrasound imaging · 10:00\sAM – 10:30\sAM$/
    );
    expect(screen.getAllByText('Primary')).toHaveLength(1);
    expect(primary.closest('.mantine-Group-root')).toHaveTextContent('Alice Smith');
    expect(await card.findByText('Ultrasound 1')).toBeInTheDocument();
    expect(await card.findByText('Exam Room A')).toBeInTheDocument();
    // The title, then each actor once, and nothing for the patients or the role no one fills.
    const rows = primary.closest('.mantine-Stack-root')?.querySelectorAll(':scope > .mantine-Group-root');
    expect(rows).toHaveLength(4);
    expect(screen.queryByText(/^(Practitioner|Device|Location)\//)).not.toBeInTheDocument();
  });

  describe('source color', () => {
    const createAppointment = (id: string, patientName: string): Appointment => ({
      resourceType: 'Appointment',
      id,
      status: 'booked',
      start: new Date(baseDate.getTime()).toISOString(),
      end: new Date(baseDate.getTime() + 30 * 60 * 1000).toISOString(),
      participant: [
        { actor: { reference: `Patient/${id}`, display: patientName }, status: 'accepted' },
        { actor: createReference(DrAliceSmith), status: 'accepted' },
      ],
    });

    test('uses the color specified on the source', () => {
      const sources: MultiCalendarSource[] = [
        { appointments: [createAppointment('a1', 'John Doe')], slots: [], color: 'teal' },
      ];
      renderWithMedplum(<MultiCalendar sources={sources} />, medplum);
      expect(getEventColor(/John Doe/)).toBe(DEFAULT_THEME.colors.teal[7]);
    });

    test('falls back to the schedule color extension when no source color is given', () => {
      const schedule: WithId<Schedule> = {
        ...DrAliceSmithSchedule,
        extension: [{ url: SchedulingScheduleColorURI, valueString: 'grape' }],
      };
      const sources: MultiCalendarSource[] = [
        { schedule, appointments: [createAppointment('a1', 'John Doe')], slots: [] },
      ];
      renderWithMedplum(<MultiCalendar sources={sources} />, medplum);
      expect(getEventColor(/John Doe/)).toBe(DEFAULT_THEME.colors.grape[7]);
    });

    test('prefers the source color over the schedule color extension', () => {
      const schedule: WithId<Schedule> = {
        ...DrAliceSmithSchedule,
        extension: [{ url: SchedulingScheduleColorURI, valueString: 'grape' }],
      };
      const sources: MultiCalendarSource[] = [
        { schedule, appointments: [createAppointment('a1', 'John Doe')], slots: [], color: 'teal' },
      ];
      renderWithMedplum(<MultiCalendar sources={sources} />, medplum);
      expect(getEventColor(/John Doe/)).toBe(DEFAULT_THEME.colors.teal[7]);
    });

    test('falls back to a default palette color when the given color is not a valid theme color', () => {
      const sources: MultiCalendarSource[] = [
        {
          appointments: [createAppointment('a1', 'John Doe')],
          slots: [],
          color: 'not-a-real-color',
        },
      ];
      renderWithMedplum(<MultiCalendar sources={sources} />, medplum);
      expect(getEventColor(/John Doe/)).toBe(DEFAULT_THEME.colors.indigo[7]);
    });

    test('cycles through the default palette by source index when no color is specified', () => {
      const sources: MultiCalendarSource[] = [
        { appointments: [createAppointment('a1', 'John Doe')], slots: [] },
        { appointments: [createAppointment('a2', 'Jane Williams')], slots: [] },
      ];
      renderWithMedplum(<MultiCalendar sources={sources} />, medplum);
      expect(getEventColor(/John Doe/)).toBe(DEFAULT_THEME.colors.indigo[7]);
      expect(getEventColor(/Jane Williams/)).toBe(DEFAULT_THEME.colors.teal[7]);
    });
  });
});
