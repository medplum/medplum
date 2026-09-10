// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { DEFAULT_THEME } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { createReference, SchedulingScheduleColorURI } from '@medplum/core';
import type { Appointment, Schedule, Slot } from '@medplum/fhirtypes';
import { DrAliceSmith, DrAliceSmithSchedule } from '@medplum/mock';
import { describe, expect, test, vi } from 'vitest';
import { render, screen, userEvent } from '../test-utils/render';
import type { MultiCalendarSource } from './MultiCalendar';
import { MultiCalendar } from './MultiCalendar';

// FullCalendar renders each event source's resolved color as a CSS variable
// on the element it draws the event with.
function getEventColor(text: string | RegExp): string | undefined {
  const el = screen.getByText(text).closest<HTMLElement>('[style*="--fc-event-color"]');
  return el?.style.getPropertyValue('--fc-event-color');
}

/**
 * Reads the chips inside an event block.
 * @param text - Text identifying the event block.
 * @returns What each chip shows, in render order.
 */
function getChips(text: string | RegExp): { label: string; color: string }[] {
  const el = screen.getByText(text).closest<HTMLElement>('.event');
  return Array.from(el?.querySelectorAll<HTMLElement>('.chip') ?? []).map((chip) => ({
    label: chip.textContent ?? '',
    color: chip.style.backgroundColor,
  }));
}

/**
 * Restates a color the way jsdom reports inline styles, which the theme names in hex.
 * @param hex - The color to convert.
 * @returns The same color as `rgb(r, g, b)`.
 */
function rgb(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * The chip background a source gets from a theme color.
 * @param color - The theme color the source resolves to.
 * @returns The background its chips are given.
 */
function chipColor(color: keyof typeof DEFAULT_THEME.colors): string {
  return rgb(DEFAULT_THEME.colors[color][2]);
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

    const createSlot = (id: string): Slot => ({
      resourceType: 'Slot',
      id,
      status: 'free',
      schedule: createReference(DrAliceSmithSchedule),
      start: new Date(baseDate.getTime() - 90 * 60 * 1000).toISOString(),
      end: new Date(baseDate.getTime()).toISOString(),
    });

    test('uses the color specified on the source', () => {
      const sources: MultiCalendarSource[] = [
        { appointments: [createAppointment('a1', 'John Doe')], slots: [], color: 'teal' },
      ];
      render(<MultiCalendar sources={sources} />);
      expect(getChips(/John Doe/)).toStrictEqual([{ label: 'Calendar 1', color: chipColor('teal') }]);
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
      expect(getChips(/John Doe/)).toStrictEqual([{ label: 'Alice Smith', color: chipColor('grape') }]);
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
      expect(getChips(/John Doe/)).toStrictEqual([{ label: 'Alice Smith', color: chipColor('teal') }]);
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
      expect(getChips(/John Doe/)).toStrictEqual([{ label: 'Calendar 1', color: chipColor('indigo') }]);
    });

    test('cycles through the default palette by source index when no color is specified', () => {
      const sources: MultiCalendarSource[] = [
        { appointments: [createAppointment('a1', 'John Doe')], slots: [] },
        { appointments: [createAppointment('a2', 'Jane Williams')], slots: [] },
      ];
      render(<MultiCalendar sources={sources} />);
      expect(getChips(/John Doe/)).toStrictEqual([{ label: 'Calendar 1', color: chipColor('indigo') }]);
      expect(getChips(/Jane Williams/)).toStrictEqual([{ label: 'Calendar 2', color: chipColor('teal') }]);
    });

    test("colors the source's slots", () => {
      const sources: MultiCalendarSource[] = [{ appointments: [], slots: [createSlot('s1')], color: 'teal' }];
      render(<MultiCalendar sources={sources} />);
      expect(getEventColor(/Available/)).toBe(DEFAULT_THEME.colors.teal[7]);
    });
  });

  describe('shared appointments', () => {
    const sharedAppointment: Appointment = {
      resourceType: 'Appointment',
      id: 'shared-appointment',
      status: 'booked',
      start: new Date(baseDate.getTime()).toISOString(),
      end: new Date(baseDate.getTime() + 30 * 60 * 1000).toISOString(),
      participant: [
        { actor: { reference: 'Patient/123', display: 'John Doe' }, status: 'accepted' },
        { actor: createReference(DrAliceSmith), status: 'accepted' },
      ],
    };

    const roomSchedule: WithId<Schedule> = {
      resourceType: 'Schedule',
      id: 'room-1-schedule',
      actor: [{ reference: 'Location/room-1', display: 'Room 1' }],
    };

    const sharedSources: MultiCalendarSource[] = [
      { schedule: DrAliceSmithSchedule, appointments: [sharedAppointment], slots: [], color: 'teal' },
      { schedule: roomSchedule, appointments: [sharedAppointment], slots: [], color: 'grape' },
    ];

    test('draws the appointment once, with a chip for each source it is on', () => {
      render(<MultiCalendar sources={sharedSources} />);
      expect(screen.getAllByText(/John Doe/)).toHaveLength(1);
      expect(getChips(/John Doe/)).toStrictEqual([
        { label: 'Alice Smith', color: chipColor('teal') },
        { label: 'Room 1', color: chipColor('grape') },
      ]);
    });

    test('names chips with the label of the source when it has one', () => {
      const sources = sharedSources.map((source, i) => ({ ...source, label: `Bay ${i}` }));
      render(<MultiCalendar sources={sources} />);
      expect(getChips(/John Doe/).map((chip) => chip.label)).toStrictEqual(['Bay 0', 'Bay 1']);
    });

    // The whole name is a Mantine Tooltip away. That the tooltip opens is Mantine's
    // to guarantee, and its pointer-driven hover does not run under jsdom, so what is
    // covered here is the name the chip is left showing.
    test('shortens a long name to fit the chip', () => {
      const sources = [{ ...sharedSources[0], label: 'Interventional Radiology Suite (North)' }];
      render(<MultiCalendar sources={sources} />);
      expect(getChips(/John Doe/).map((chip) => chip.label)).toStrictEqual(['Interventional…']);
    });

    test('drops a parenthesized qualifier that would crowd out the name', () => {
      const sources = [{ ...sharedSources[0], label: 'Ultrasound 1 (Main Campus)' }];
      render(<MultiCalendar sources={sources} />);
      expect(getChips(/John Doe/).map((chip) => chip.label)).toStrictEqual(['Ultrasound 1']);
    });

    test('hands the first source that links an appointment to its click handler', async () => {
      const onSelectAppointment = vi.fn();
      render(<MultiCalendar sources={sharedSources} onSelectAppointment={onSelectAppointment} />);
      await userEvent.click(screen.getByText(/John Doe/));
      expect(onSelectAppointment).toHaveBeenCalledWith(sharedAppointment, DrAliceSmithSchedule);
    });
  });
});
