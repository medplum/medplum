// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference, sleep } from '@medplum/core';
import type { Appointment, HealthcareServiceAvailableTime, Slot } from '@medplum/fhirtypes';
import { DrAliceSmith, DrAliceSmithSchedule } from '@medplum/mock';
import { describe, expect, test, vi } from 'vitest';
import { render, screen, userEvent } from '../test-utils/render';
import type { DateTimeRange } from '../types';
import type { MultiCalendarSource } from './MultiCalendar';
import { MultiCalendar } from './MultiCalendar';

describe('MultiCalendar', () => {
  // Use today's date to ensure appointments show in visible range
  const now = new Date();
  const baseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0);

  const createAppointment = (overrides: Partial<Appointment> = {}): WithId<Appointment> => ({
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
    ...overrides,
  });

  const createSlot = (overrides: Partial<Slot> = {}): WithId<Slot> => ({
    resourceType: 'Slot',
    id: 'test-slot-1',
    status: 'free',
    schedule: createReference(DrAliceSmithSchedule),
    start: new Date(baseDate.getTime()).toISOString(),
    end: new Date(baseDate.getTime() + 30 * 60 * 1000).toISOString(),
    ...overrides,
  });

  const setup = ({
    sources,
    availableTime,
    onSelectInterval,
    onSelectSlot,
    onSelectAppointment,
    onDoubleClickAppointment,
    onRangeChange,
  }: {
    sources?: MultiCalendarSource[];
    availableTime?: HealthcareServiceAvailableTime[];
    onSelectInterval?: () => void;
    onSelectSlot?: (slot: Slot) => void;
    onSelectAppointment?: (appointment: Appointment) => void;
    onDoubleClickAppointment?: (appointment: Appointment) => void;
    onRangeChange?: (range: DateTimeRange) => void;
  } = {}): ReturnType<typeof render> => {
    return render(
      <MultiCalendar
        sources={sources ?? []}
        availableTime={availableTime}
        onSelectInterval={onSelectInterval}
        onSelectSlot={onSelectSlot}
        onSelectAppointment={onSelectAppointment}
        onDoubleClickAppointment={onDoubleClickAppointment}
        onRangeChange={onRangeChange}
      />
    );
  };

  describe('sources', () => {
    test('renders appointment with patient name', async () => {
      const source = {
        schedule: DrAliceSmithSchedule,
        appointments: [createAppointment()],
        slots: [],
      };
      setup({ sources: [source] });
      expect(screen.getByText(/John Doe/)).toBeInTheDocument();
    });

    test('renders appointments without a patient', async () => {
      const appointment = {
        ...createAppointment(),
        participant: [
          {
            actor: createReference(DrAliceSmith),
            status: 'accepted' as const,
          },
        ],
      };
      const source = {
        schedule: DrAliceSmithSchedule,
        appointments: [appointment],
        slots: [],
      };
      setup({ sources: [source] });
      expect(screen.getByText(/No Patient/)).toBeInTheDocument();
    });

    test('calls onSelectAppointment when clicking an appointment', async () => {
      const appointment = createAppointment();
      const onSelectAppointment = vi.fn();

      setup({
        sources: [
          {
            schedule: DrAliceSmithSchedule,
            appointments: [appointment],
            slots: [],
          },
        ],
        onSelectAppointment,
      });
      expect(screen.getByText(/John Doe/)).toBeInTheDocument();

      await userEvent.click(screen.getByText(/John Doe/));
      await expect(onSelectAppointment).toHaveBeenCalledWith(appointment, DrAliceSmithSchedule);
    });

    test('calls onDoubleClickAppointment when double clicking an appointment', async () => {
      const appointment = createAppointment();
      const onSelectAppointment = vi.fn();
      const onDoubleClickAppointment = vi.fn();

      setup({
        sources: [
          {
            schedule: DrAliceSmithSchedule,
            appointments: [appointment],
            slots: [],
          },
        ],
        onSelectAppointment,
        onDoubleClickAppointment,
      });
      expect(screen.getByText(/John Doe/)).toBeInTheDocument();

      await userEvent.dblClick(screen.getByText(/John Doe/));
      await expect(onSelectAppointment).not.toHaveBeenCalledWith(appointment);
      await expect(onDoubleClickAppointment).toHaveBeenCalledWith(appointment, DrAliceSmithSchedule);
    });

    test('renders multiple appointments', async () => {
      const appointment1 = createAppointment({
        id: 'apt-1',
        participant: [{ actor: { reference: 'Patient/1', display: 'Homer Simpson' }, status: 'accepted' }],
      });
      const appointment2 = createAppointment({
        id: 'apt-2',
        start: new Date(baseDate.getTime() + 60 * 60 * 1000).toISOString(),
        end: new Date(baseDate.getTime() + 90 * 60 * 1000).toISOString(),
        participant: [{ actor: { reference: 'Patient/2', display: 'Bob Jones' }, status: 'accepted' }],
      });

      setup({
        sources: [
          {
            schedule: DrAliceSmithSchedule,
            appointments: [appointment1, appointment2],
            slots: [],
          },
        ],
      });
      expect(screen.getByText(/Homer Simpson/)).toBeInTheDocument();
      expect(screen.getByText(/Bob Jones/)).toBeInTheDocument();
    });
  });

  test('calls onDoubleClickAppointment when double-clicking an appointment', async () => {
    const onDoubleClickAppointment = vi.fn();
    const appointment = createAppointment();
    setup({
      sources: [
        {
          schedule: DrAliceSmithSchedule,
          appointments: [appointment],
          slots: [],
        },
      ],
      onDoubleClickAppointment,
    });

    await userEvent.dblClick(screen.getByText(/John Doe/));
    await expect(onDoubleClickAppointment).toHaveBeenCalledWith(appointment, DrAliceSmithSchedule);
  });

  test('double-clicking an appointment does not also fire onSelectAppointment', async () => {
    const onSelectAppointment = vi.fn();
    const onDoubleClickAppointment = vi.fn();
    const appointment = createAppointment();
    setup({
      sources: [
        {
          schedule: DrAliceSmithSchedule,
          appointments: [appointment],
          slots: [],
        },
      ],
      onSelectAppointment,
      onDoubleClickAppointment,
    });

    await userEvent.dblClick(screen.getByText(/John Doe/));
    expect(onDoubleClickAppointment).toHaveBeenCalledWith(appointment, DrAliceSmithSchedule);
    expect(onSelectAppointment).not.toHaveBeenCalled();

    // With onDoubleClickAppointment set, the single-click select is
    // debounced (100ms) so the double-click handler can cancel it before it
    // fires. Wait past the debounce window to confirm the pending select
    // was cancelled, not merely delayed.
    await sleep(150);
    expect(onSelectAppointment).not.toHaveBeenCalled();
  });

  describe('slots', () => {
    /* Slots are rendered as background events in week/day view */
    test('renders slots as background events', async () => {
      const slot = createSlot();
      setup({
        sources: [
          {
            schedule: DrAliceSmithSchedule,
            slots: [slot],
            appointments: [],
          },
        ],
      });

      expect(screen.getByText('Available')).toBeInTheDocument();
    });

    test('renders multiple slots', async () => {
      const slot1 = createSlot({ id: 'slot-1', status: 'free' });
      const slot2 = createSlot({
        id: 'slot-2',
        status: 'busy',
        start: new Date(baseDate.getTime() + 60 * 60 * 1000).toISOString(),
        end: new Date(baseDate.getTime() + 90 * 60 * 1000).toISOString(),
      });
      const slot3 = createSlot({
        id: 'slot-3',
        status: 'busy',
        start: new Date(baseDate.getTime() + 120 * 60 * 1000).toISOString(),
        end: new Date(baseDate.getTime() + 150 * 60 * 1000).toISOString(),
      });

      setup({
        sources: [
          {
            schedule: DrAliceSmithSchedule,
            slots: [slot1, slot2, slot3],
            appointments: [],
          },
        ],
      });
      expect(screen.queryAllByText('Available')).toHaveLength(1);
      expect(screen.queryAllByText('Blocked')).toHaveLength(2);
    });

    test('calls onSelectSlot when clicking a Slot', async () => {
      const onSelectSlot = vi.fn();
      const slot = createSlot();
      setup({
        sources: [
          {
            schedule: DrAliceSmithSchedule,
            slots: [slot],
            appointments: [],
          },
        ],
        onSelectSlot,
      });

      await userEvent.click(screen.getByText('Available'));
      await expect(onSelectSlot).toHaveBeenCalledWith(slot, DrAliceSmithSchedule);
    });

    test('still calls onSelectSlot when double-clicking a slot while onDoubleClickAppointment is configured', async () => {
      const onSelectSlot = vi.fn();
      const onDoubleClickAppointment = vi.fn();
      const slot = createSlot();
      setup({
        sources: [
          {
            schedule: DrAliceSmithSchedule,
            slots: [slot],
            appointments: [],
          },
        ],
        onSelectSlot,
        onDoubleClickAppointment,
      });

      await userEvent.dblClick(screen.getByText('Available'));
      expect(onDoubleClickAppointment).not.toHaveBeenCalled();

      // Since the double click landed on a slot (not an appointment), the pending
      // single-click select must not be cancelled — it should still fire once the
      // debounce elapses.
      await sleep(150);
      expect(onSelectSlot).toHaveBeenCalledWith(slot, DrAliceSmithSchedule);
    });
  });
});
