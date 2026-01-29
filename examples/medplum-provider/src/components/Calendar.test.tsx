// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { render, screen, userEvent } from '../test-utils/render';
import type { Appointment, Slot } from '@medplum/fhirtypes';
import { Calendar } from './Calendar';
import type { Range } from '../types/scheduling';
import { describe, expect, test, vi } from 'vitest';

// Mock document.elementFromPoint for react-big-calendar Selection
document.elementFromPoint = vi.fn(() => null);

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
    onSelectInterval,
    onSelectSlot,
    onSelectAppointment,
    onRangeChange,
  }: {
    slots?: Slot[];
    appointments?: Appointment[];
    onSelectInterval?: () => void;
    onSelectSlot?: (slot: Slot) => void;
    onSelectAppointment?: (appointment: Appointment) => void;
    onRangeChange?: (range: Range) => void;
  } = {}): ReturnType<typeof render> => {
    return render(
      <Calendar
        slots={slots}
        appointments={appointments}
        onSelectInterval={onSelectInterval}
        onSelectSlot={onSelectSlot}
        onSelectAppointment={onSelectAppointment}
        onRangeChange={onRangeChange}
      />
    );
  };

  describe('CalendarToolbar', () => {
    test('renders toolbar with navigation buttons', async () => {
      setup();

      expect(screen.getByText('Today')).toBeInTheDocument();
      expect(screen.getByLabelText('Next')).toBeInTheDocument();
      expect(screen.getByLabelText('Previous')).toBeInTheDocument();
    });

    test('renders view switcher with Month, Week, Day options', async () => {
      setup();
      expect(screen.getByText('Month')).toBeInTheDocument();
      expect(screen.getByText('Week')).toBeInTheDocument();
      expect(screen.getByText('Day')).toBeInTheDocument();
    });

    test('displays current month/year in title for non-day views', async () => {
      setup();

      // Check for month/year format (e.g., "January 2024")
      const title = screen.getByText(/\w+\s+\d{4}/);
      expect(title).toBeInTheDocument();
    });

    test('navigates to previous period when clicking prev button', async () => {
      const onRangeChange = vi.fn();
      setup({ onRangeChange });

      expect(screen.getByText('Today')).toBeInTheDocument();
      expect(onRangeChange).toHaveBeenCalled();

      const initialCallCount = onRangeChange.mock.calls.length;

      // Navigation should trigger a range change
      await userEvent.click(screen.getByLabelText('Previous'));
      expect(onRangeChange.mock.calls.length).toBeGreaterThan(initialCallCount);
    });

    test('navigates to next period when clicking next button', async () => {
      const onRangeChange = vi.fn();
      setup({ onRangeChange });
      expect(screen.getByText('Today')).toBeInTheDocument();
      expect(onRangeChange).toHaveBeenCalled();

      const initialCallCount = onRangeChange.mock.calls.length;

      // Navigation should trigger a range change
      await userEvent.click(screen.getByLabelText('Next'));
      expect(onRangeChange.mock.calls.length).toBeGreaterThan(initialCallCount);
    });

    test('navigates to today when clicking today button', async () => {
      setup();

      // First navigate away from today
      await userEvent.click(screen.getByLabelText('Previous'));

      // Then click today
      await userEvent.click(screen.getByText('Today'));

      // Should be back to current month
      const title = screen.getByRole('heading', { level: 4 }).textContent;
      const today = new Date();
      const expectedMonth = today.toLocaleDateString('en-US', { month: 'long' });
      expect(title).toContain(expectedMonth);
    });

    test('switches to day view and triggers range change', async () => {
      const onRangeChange = vi.fn();
      setup({ onRangeChange });

      expect(screen.getByText('Day')).toBeInTheDocument();
      expect(onRangeChange).toHaveBeenCalled();

      const initialCallCount = onRangeChange.mock.calls.length;

      // Click on the Day option in the SegmentedControl
      await userEvent.click(screen.getByText('Day'));

      // Day view should trigger a range change with different range
      expect(onRangeChange.mock.calls.length).toBeGreaterThan(initialCallCount);
    });

    test('switches between views', async () => {
      setup();

      const monthRadio = screen.getByLabelText<HTMLInputElement>('Month');
      const weekRadio = screen.getByLabelText<HTMLInputElement>('Week');
      const dayRadio = screen.getByLabelText<HTMLInputElement>('Day');
      expect(monthRadio).toBeInTheDocument();
      expect(weekRadio).toBeInTheDocument();
      expect(dayRadio).toBeInTheDocument();

      // defaults to Week view on first render
      expect(monthRadio).toHaveProperty('checked', false);
      expect(weekRadio).toHaveProperty('checked', true);
      expect(dayRadio).toHaveProperty('checked', false);

      // Switch to month view
      await userEvent.click(screen.getByText('Month'));
      expect(monthRadio).toHaveProperty('checked', true);
      expect(weekRadio).toHaveProperty('checked', false);
      expect(dayRadio).toHaveProperty('checked', false);
      expect(screen.getByLabelText('Month View')).toBeInTheDocument();

      // Switch back to week view
      await userEvent.click(screen.getByText('Week'));
      expect(monthRadio).toHaveProperty('checked', false);
      expect(weekRadio).toHaveProperty('checked', true);
      expect(dayRadio).toHaveProperty('checked', false);
      expect(screen.queryByLabelText('Month View')).not.toBeInTheDocument();

      // Switch to day view
      await userEvent.click(screen.getByText('Day'));
      expect(monthRadio).toHaveProperty('checked', false);
      expect(weekRadio).toHaveProperty('checked', false);
      expect(dayRadio).toHaveProperty('checked', true);
      expect(screen.queryByLabelText('Month View')).not.toBeInTheDocument();
    });
  });

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

    test('filters out cancelled appointments', async () => {
      const cancelledAppointment = createAppointment({
        id: 'cancelled-1',
        status: 'cancelled',
        participant: [
          {
            actor: {
              reference: 'Patient/999',
              display: 'Cancelled Patient',
            },
            status: 'accepted',
          },
        ],
      });
      const bookedAppointment = createAppointment();

      setup({ appointments: [cancelledAppointment, bookedAppointment] });
      expect(screen.getByText(/John Doe/)).toBeInTheDocument();
      expect(screen.queryByText(/Cancelled Patient/)).not.toBeInTheDocument();
    });

    test('shows status suffix for non-standard statuses', async () => {
      const pendingAppointment = createAppointment({
        status: 'pending',
      });

      setup({ appointments: [pendingAppointment] });
      expect(screen.getByText(/John Doe.*\(pending\)/)).toBeInTheDocument();
    });

    test.each(['booked', 'arrived', 'fulfilled'] as const)(
      'does not show status suffix for %s appointments',
      async (status) => {
        const bookedAppointment = createAppointment({ status });

        setup({ appointments: [bookedAppointment] });
        const appointmentText = screen.getByText(/John Doe/);
        expect(appointmentText.textContent).not.toContain(status);
      }
    );

    test.each(['pending', 'waitlist', 'noshow'] as const)('shows status suffix for %s appointments', async (status) => {
      const bookedAppointment = createAppointment({ status });

      setup({ appointments: [bookedAppointment] });
      const appointmentText = screen.getByText(/John Doe/);
      expect(appointmentText.textContent).toContain(`(${status})`);
    });

    test('calls onSelectAppointment when clicking an appointment', async () => {
      const appointment = createAppointment();
      const onSelectAppointment = vi.fn();

      setup({ appointments: [appointment], onSelectAppointment });
      expect(screen.getByText(/John Doe/)).toBeInTheDocument();

      await userEvent.click(screen.getByText(/John Doe/));
      expect(onSelectAppointment).toHaveBeenCalledWith(appointment);
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
  });

  describe('slots', () => {
    /* Slots are rendered as background events in week/day view */
    test('renders slots as background events', async () => {
      const slot = createSlot();
      setup({ slots: [slot] });

      expect(screen.getByText('Available')).toBeInTheDocument();
    });

    test('clicking on a $find slots', async () => {
      const onSelectAppointment = vi.fn();
      const onSelectInterval = vi.fn();
      const onSelectSlot = vi.fn();
      const slot = createSlot({
        identifier: [{ system: 'https://medplum.com/fhir/scheduling-transient-id', value: 'abcde', use: 'temp' }],
      });
      setup({ onSelectAppointment, onSelectInterval, onSelectSlot, slots: [slot] });

      expect(screen.getByText('Available')).toBeInTheDocument();
      await userEvent.click(screen.getByText('Available'));
      expect(onSelectSlot).toHaveBeenCalledWith(slot);
      expect(onSelectAppointment).not.toHaveBeenCalled();
      expect(onSelectInterval).not.toHaveBeenCalled();
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

      setup({ slots: [slot1, slot2, slot3] });
      expect(screen.queryAllByText('Available')).toHaveLength(1);
      expect(screen.queryAllByText('Blocked')).toHaveLength(2);
    });

    test('calls onSelectSlot when clicking a Slot', async () => {
      const onSelectSlot = vi.fn();
      const slot = createSlot();
      setup({ slots: [slot], onSelectSlot });

      await userEvent.click(screen.getByText('Available'));
      expect(onSelectSlot).toHaveBeenCalledWith(slot);
    });
  });

  describe('onRangeChange', () => {
    test('calls onRangeChange on initial render', async () => {
      const onRangeChange = vi.fn();
      setup({ onRangeChange });
      expect(onRangeChange).toHaveBeenCalled();

      const range = onRangeChange.mock.calls[0][0];
      expect(range.start).toBeInstanceOf(Date);
      expect(range.end).toBeInstanceOf(Date);
      expect(range.end.getTime()).toBeGreaterThan(range.start.getTime());
    });

    test('calls onRangeChange when navigating', async () => {
      const onRangeChange = vi.fn();
      setup({ onRangeChange });
      expect(onRangeChange).toHaveBeenCalled();

      const initialCallCount = onRangeChange.mock.calls.length;

      // Navigate to next period
      const nextButton = screen.getByLabelText('Next');
      await userEvent.click(nextButton);

      expect(onRangeChange.mock.calls.length).toBeGreaterThan(initialCallCount);
    });

    test('calls onRangeChange when switching views', async () => {
      const onRangeChange = vi.fn();
      setup({ onRangeChange });
      expect(onRangeChange).toHaveBeenCalled();

      const initialCallCount = onRangeChange.mock.calls.length;

      // Switch to month view
      await userEvent.click(screen.getByText('Month'));
      expect(onRangeChange.mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });

  describe('styling', () => {
    test('applies custom style prop', async () => {
      const { container } = render(
        <Calendar slots={[]} appointments={[]} style={{ height: '500px', width: '100%' }} />
      );
      const calendar = container.querySelector('.rbc-calendar');
      expect(calendar).toHaveStyle({ height: '500px', width: '100%' });
    });
  });
});
