// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { DEFAULT_THEME } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { createReference, SchedulingScheduleColorURI } from '@medplum/core';
import type { Appointment, Schedule, Slot } from '@medplum/fhirtypes';
import { DrAliceSmith, DrAliceSmithSchedule } from '@medplum/mock';
import { describe, expect, test } from 'vitest';
import { render, screen } from '../test-utils/render';
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
  // Use today's date to ensure appointments show in visible range
  const now = new Date();
  const baseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0);

  // This is a thin wrapper around CalendarBase, so we just test the happy path here.
  test('rendering', () => {
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

    const sources: MultiCalendarSource[] = [{ appointments, slots }];
    render(<MultiCalendar sources={sources} />);
    expect(screen.getByText(/John Doe/)).toBeInTheDocument();
    expect(screen.getByText(/Jane Williams/)).toBeInTheDocument();
    expect(screen.getByText(/Available/)).toBeInTheDocument();
    expect(screen.getByText(/Blocked/)).toBeInTheDocument();
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
      render(<MultiCalendar sources={sources} />);
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
      render(<MultiCalendar sources={sources} />);
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
      render(<MultiCalendar sources={sources} />);
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
      render(<MultiCalendar sources={sources} />);
      expect(getEventColor(/John Doe/)).toBe(DEFAULT_THEME.colors.indigo[7]);
    });

    test('cycles through the default palette by source index when no color is specified', () => {
      const sources: MultiCalendarSource[] = [
        { appointments: [createAppointment('a1', 'John Doe')], slots: [] },
        { appointments: [createAppointment('a2', 'Jane Williams')], slots: [] },
      ];
      render(<MultiCalendar sources={sources} />);
      expect(getEventColor(/John Doe/)).toBe(DEFAULT_THEME.colors.indigo[7]);
      expect(getEventColor(/Jane Williams/)).toBe(DEFAULT_THEME.colors.teal[7]);
    });
  });
});
