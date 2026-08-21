// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { sleep } from '@medplum/core';
import type { Appointment, HealthcareServiceAvailableTime, Slot } from '@medplum/fhirtypes';
import { describe, expect, test, vi } from 'vitest';
import { render, screen, userEvent } from '../test-utils/render';
import type { DateTimeRange } from '../types';
import { Calendar } from './Calendar';

describe('Calendar', () => {
  // Use today's date to ensure appointments show in visible range
  const now = new Date();
  const baseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0);

  const createAppointment = (overrides: Partial<Appointment> = {}): Appointment => ({
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
        actor: {
          reference: 'Practitioner/456',
          display: 'Dr. Smith',
        },
        status: 'accepted',
      },
    ],
    ...overrides,
  });

  const createSlot = (overrides: Partial<Slot> = {}): Slot => ({
    resourceType: 'Slot',
    id: 'test-slot-1',
    status: 'free',
    schedule: { reference: 'Schedule/1' },
    start: new Date(baseDate.getTime()).toISOString(),
    end: new Date(baseDate.getTime() + 30 * 60 * 1000).toISOString(),
    ...overrides,
  });

  const setup = ({
    slots = [],
    appointments = [],
    availableTime,
    onSelectInterval,
    onSelectSlot,
    onSelectAppointment,
    onDoubleClickAppointment,
    onRangeChange,
  }: {
    slots?: Slot[];
    appointments?: Appointment[];
    availableTime?: HealthcareServiceAvailableTime[];
    onSelectInterval?: () => void;
    onSelectSlot?: (slot: Slot) => void;
    onSelectAppointment?: (appointment: Appointment) => void;
    onDoubleClickAppointment?: (appointment: Appointment) => void;
    onRangeChange?: (range: DateTimeRange) => void;
  } = {}): ReturnType<typeof render> => {
    return render(
      <Calendar
        slots={slots}
        appointments={appointments}
        availableTime={availableTime}
        onSelectInterval={onSelectInterval}
        onSelectSlot={onSelectSlot}
        onSelectAppointment={onSelectAppointment}
        onDoubleClickAppointment={onDoubleClickAppointment}
        onRangeChange={onRangeChange}
      />
    );
  };

  describe('appointments', () => {
    test('renders appointment with patient name', async () => {
      const appointment = createAppointment();
      setup({ appointments: [appointment] });
      expect(screen.getByText(/John Doe/)).toBeInTheDocument();
    });

    test('renders appointments without a patient', async () => {
      const appointment = { ...createAppointment(), participant: [] };
      setup({ appointments: [appointment] });
      expect(screen.getByText(/No Patient/)).toBeInTheDocument();
    });

    test.each(['booked', 'arrived', 'fulfilled', 'pending'] as const)(
      'does not show status suffix for %s appointments',
      async (status) => {
        const bookedAppointment = createAppointment({ status });

        setup({ appointments: [bookedAppointment] });
        const appointmentText = screen.getByText(/John Doe/);
        expect(appointmentText.textContent).not.toContain(status);
      }
    );

    test.each(['waitlist', 'noshow', 'cancelled'] as const)(
      'shows status suffix for %s appointments',
      async (status) => {
        const bookedAppointment = createAppointment({ status });

        setup({ appointments: [bookedAppointment] });
        const appointmentText = screen.getByText(/John Doe/);
        expect(appointmentText.textContent).toContain(`(${status})`);
      }
    );

    test('calls onSelectAppointment when clicking an appointment', async () => {
      const appointment = createAppointment();
      const onSelectAppointment = vi.fn();

      setup({ appointments: [appointment], onSelectAppointment });
      expect(screen.getByText(/John Doe/)).toBeInTheDocument();

      await userEvent.click(screen.getByText(/John Doe/));
      await expect(onSelectAppointment).toHaveBeenCalledWith(appointment);
    });

    test('renders multiple appointments', async () => {
      const appointment1 = createAppointment({
        id: 'apt-1',
        participant: [{ actor: { reference: 'Patient/1', display: 'Alice Smith' }, status: 'accepted' }],
      });
      const appointment2 = createAppointment({
        id: 'apt-2',
        start: new Date(baseDate.getTime() + 60 * 60 * 1000).toISOString(),
        end: new Date(baseDate.getTime() + 90 * 60 * 1000).toISOString(),
        participant: [{ actor: { reference: 'Patient/2', display: 'Bob Jones' }, status: 'accepted' }],
      });

      setup({ appointments: [appointment1, appointment2] });
      expect(screen.getByText(/Alice Smith/)).toBeInTheDocument();
      expect(screen.getByText(/Bob Jones/)).toBeInTheDocument();
    });

    test('calls onDoubleClickAppointment when double-clicking an appointment', async () => {
      const onDoubleClickAppointment = vi.fn();
      const appointment = createAppointment();
      setup({ appointments: [appointment], onDoubleClickAppointment });

      await userEvent.dblClick(screen.getByText(/John Doe/));
      await expect(onDoubleClickAppointment).toHaveBeenCalledWith(appointment);
    });
  });

  describe('slots', () => {
    /* Slots are rendered as background events in week/day view */
    test('renders slots as background events', async () => {
      const slot = createSlot();
      setup({ slots: [slot] });

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
      const slot4 = createSlot({
        id: 'slot-4',
        status: 'entered-in-error',
        start: new Date(baseDate.getTime() + 150 * 60 * 1000).toISOString(),
        end: new Date(baseDate.getTime() + 180 * 60 * 1000).toISOString(),
      });

      setup({ slots: [slot1, slot2, slot3, slot4] });
      expect(screen.queryAllByText('Available')).toHaveLength(1);
      expect(screen.queryAllByText('Blocked')).toHaveLength(2);
      expect(screen.queryAllByText('Entered in error')).toHaveLength(1);
    });

    test('calls onSelectSlot when clicking a Slot', async () => {
      const onSelectSlot = vi.fn();
      const slot = createSlot();
      setup({ slots: [slot], onSelectSlot });

      await userEvent.click(screen.getByText('Available'));
      await expect(onSelectSlot).toHaveBeenCalledWith(slot);
    });

    test('does not call onDoubleClickAppointment when double-clicking a slot', async () => {
      const onDoubleClickAppointment = vi.fn();
      const slot = createSlot();
      setup({ appointments: [], slots: [slot], onDoubleClickAppointment });

      await userEvent.dblClick(screen.getByText('Available'));
      await expect(onDoubleClickAppointment).not.toHaveBeenCalled();
    });

    test('still calls onSelectSlot when double-clicking a slot while onDoubleClickAppointment is configured', async () => {
      const onSelectSlot = vi.fn();
      const onDoubleClickAppointment = vi.fn();
      const slot = createSlot();
      setup({ appointments: [], slots: [slot], onSelectSlot, onDoubleClickAppointment });

      await userEvent.dblClick(screen.getByText('Available'));
      expect(onDoubleClickAppointment).not.toHaveBeenCalled();

      // Since the double click landed on a slot (not an appointment), the pending
      // single-click select must not be cancelled — it should still fire once the
      // debounce elapses.
      await sleep(150);
      expect(onSelectSlot).toHaveBeenCalledWith(slot);
    });

    test('shows busy slot not referenced by any appointment', async () => {
      const busySlot = createSlot({ id: 'busy-slot-1', status: 'busy' });
      setup({ slots: [busySlot] });

      expect(screen.getByText('Blocked')).toBeInTheDocument();
    });
  });
});
