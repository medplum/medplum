// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference, sleep } from '@medplum/core';
import type { Appointment, Slot } from '@medplum/fhirtypes';
import { DrAliceSmith, DrAliceSmithSchedule } from '@medplum/mock';
import { describe, expect, test, vi } from 'vitest';
import { render, screen, userEvent } from '../test-utils/render';
import type { CalendarBaseProps } from './CalendarBase';
import { CalendarBase } from './CalendarBase';

describe('CalendarBase', () => {
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

  const setup = (props: CalendarBaseProps): ReturnType<typeof render> => {
    return render(<CalendarBase {...props} />);
  };

  describe('eventSources', () => {
    test('renders appointment with patient name', async () => {
      const source = {
        schedule: DrAliceSmithSchedule,
        appointments: [createAppointment()],
        slots: [],
      };
      setup({ eventSources: [source] });
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
      setup({ eventSources: [source] });
      expect(screen.getByText(/No Patient/)).toBeInTheDocument();
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
        eventSources: [
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

    test('renders "free" slots', async () => {
      const source = {
        schedule: DrAliceSmithSchedule,
        appointments: [],
        slots: [createSlot({ status: 'free' })],
      };
      setup({ eventSources: [source] });
      expect(screen.getByText(/Available/)).toBeInTheDocument();
    });

    test('renders "busy" slots', async () => {
      const source = {
        schedule: DrAliceSmithSchedule,
        appointments: [],
        slots: [createSlot({ status: 'busy' })],
      };
      setup({ eventSources: [source] });
      expect(screen.getByText(/Blocked/)).toBeInTheDocument();
    });

    test('filters out slots backing rendered appointmenst', () => {
      const appointment = createAppointment({ slot: [{ reference: 'Slot/slot-1' }] });
      const source = {
        schedule: DrAliceSmithSchedule,
        appointments: [appointment],
        slots: [createSlot({ id: 'slot-1', status: 'busy', start: appointment.start, end: appointment.end })],
      };
      setup({ eventSources: [source] });
      expect(screen.getByText(/John Doe/)).toBeInTheDocument();
      expect(screen.queryAllByText(/Blocked/)).toHaveLength(0);
    });
  });

  // Week view always lays out columns Sun..Sat regardless of which week is showing,
  // so day-of-week behavior can be asserted by position without depending on "today".
  const getWeekGridCells = (container: HTMLElement): Element[] =>
    Array.from(container.querySelectorAll('[role="gridcell"][data-date]'));

  describe('CalendarToolbar', () => {
    test('renders toolbar with navigation buttons', async () => {
      setup({ eventSources: [] });

      expect(screen.getByText('Today')).toBeInTheDocument();
      expect(screen.getByLabelText('Next')).toBeInTheDocument();
      expect(screen.getByLabelText('Previous')).toBeInTheDocument();
    });

    test('renders view switcher with Month, Week, Day options', async () => {
      setup({ eventSources: [] });
      expect(screen.getByText('Month')).toBeInTheDocument();
      expect(screen.getByText('Week')).toBeInTheDocument();
      expect(screen.getByText('Day')).toBeInTheDocument();
    });

    test('displays current month/year in title for non-day views', async () => {
      setup({ eventSources: [] });

      // Check for month/year format (e.g., "January 2024")
      const title = screen.getByText(/\w+\s+\d{4}/);
      expect(title).toBeInTheDocument();
    });

    test('navigates to previous period when clicking prev button', async () => {
      const onRangeChange = vi.fn();
      setup({ eventSources: [], onRangeChange });

      expect(screen.getByText('Today')).toBeInTheDocument();
      expect(onRangeChange).toHaveBeenCalled();

      const initialCallCount = onRangeChange.mock.calls.length;

      // Navigation should trigger a range change
      await userEvent.click(screen.getByLabelText('Previous'));
      expect(onRangeChange.mock.calls.length).toBeGreaterThan(initialCallCount);
    });

    test('navigates to next period when clicking next button', async () => {
      const onRangeChange = vi.fn();
      setup({ eventSources: [], onRangeChange });
      expect(screen.getByText('Today')).toBeInTheDocument();
      expect(onRangeChange).toHaveBeenCalled();

      const initialCallCount = onRangeChange.mock.calls.length;

      // Navigation should trigger a range change
      await userEvent.click(screen.getByLabelText('Next'));
      expect(onRangeChange.mock.calls.length).toBeGreaterThan(initialCallCount);
    });

    test('navigates to today when clicking today button', async () => {
      const onRangeChange = vi.fn();
      setup({ eventSources: [], onRangeChange });

      // First navigate away from today
      await userEvent.click(screen.getByLabelText('Previous'));

      // Then click today
      await userEvent.click(screen.getByText('Today'));

      const today = new Date();
      const range = onRangeChange.mock.lastCall?.[0];
      expect(range.start.getTime()).toBeLessThanOrEqual(today.getTime());
      expect(range.end.getTime()).toBeGreaterThan(today.getTime());
    });

    test('switches to day view and triggers range change', async () => {
      const onRangeChange = vi.fn();
      setup({ eventSources: [], onRangeChange });

      expect(screen.getByText('Day')).toBeInTheDocument();
      expect(onRangeChange).toHaveBeenCalled();

      const initialCallCount = onRangeChange.mock.calls.length;

      // Click on the Day option in the SegmentedControl
      await userEvent.click(screen.getByText('Day'));

      // Day view should trigger a range change with different range
      expect(onRangeChange.mock.calls.length).toBeGreaterThan(initialCallCount);
    });

    test('switches between views', async () => {
      setup({ eventSources: [] });

      const monthRadio = screen.getByLabelText<HTMLInputElement>('Month');
      const weekRadio = screen.getByLabelText<HTMLInputElement>('Week');
      const dayRadio = screen.getByLabelText<HTMLInputElement>('Day');
      expect(monthRadio).toBeInTheDocument();
      expect(weekRadio).toBeInTheDocument();
      expect(dayRadio).toBeInTheDocument();

      // defaults to Week view on first render — time grid has a "Timed" rowheader
      expect(monthRadio).toHaveProperty('checked', false);
      expect(weekRadio).toHaveProperty('checked', true);
      expect(dayRadio).toHaveProperty('checked', false);
      expect(screen.getByRole('rowheader', { name: 'Timed' })).toBeInTheDocument();
      expect(screen.getAllByRole('columnheader')).toHaveLength(7);

      // Switch to month view — column headers become day names ("Sunday", "Monday", …)
      await userEvent.click(screen.getByText('Month'));
      expect(monthRadio).toHaveProperty('checked', true);
      expect(weekRadio).toHaveProperty('checked', false);
      expect(dayRadio).toHaveProperty('checked', false);
      expect(screen.getByRole('columnheader', { name: 'Sunday' })).toBeInTheDocument();
      expect(screen.getAllByRole('columnheader')).toHaveLength(7);

      // Switch back to week view — time grid returns
      await userEvent.click(screen.getByText('Week'));
      expect(monthRadio).toHaveProperty('checked', false);
      expect(weekRadio).toHaveProperty('checked', true);
      expect(dayRadio).toHaveProperty('checked', false);
      expect(screen.getByRole('rowheader', { name: 'Timed' })).toBeInTheDocument();
      expect(screen.getAllByRole('columnheader')).toHaveLength(7);

      // Switch to day view — single column (one columnheader for the day), with "Timed" rowheader
      await userEvent.click(screen.getByText('Day'));
      expect(monthRadio).toHaveProperty('checked', false);
      expect(weekRadio).toHaveProperty('checked', false);
      expect(dayRadio).toHaveProperty('checked', true);
      expect(screen.getByRole('rowheader', { name: 'Timed' })).toBeInTheDocument();
      expect(screen.getAllByRole('columnheader')).toHaveLength(1);
    });
  });

  describe('event interactions', () => {
    test('calls onAppointmentSelect when clicking on an appointment', async () => {
      const onSelectAppointment = vi.fn();
      const onSelectSlot = vi.fn();
      setup({
        eventSources: [
          {
            appointments: [createAppointment()],
            slots: [],
          },
        ],
        onSelectAppointment,
        onSelectSlot,
      });
      await userEvent.click(screen.getByText('John Doe'));
      expect(onSelectAppointment).toHaveBeenCalled();
      expect(onSelectSlot).not.toHaveBeenCalled();
    });

    test('calls onAppointmentDoubleClick when double clicking on an appointment', async () => {
      const onSelectAppointment = vi.fn();
      const onDoubleClickAppointment = vi.fn();
      const onSelectSlot = vi.fn();
      const onDoubleClickSlot = vi.fn();
      setup({
        eventSources: [
          {
            appointments: [createAppointment()],
            slots: [],
          },
        ],
        onSelectAppointment,
        onDoubleClickAppointment,
        onSelectSlot,
        onDoubleClickSlot,
      });

      await userEvent.dblClick(screen.getByText('John Doe'));
      expect(onDoubleClickAppointment).toHaveBeenCalled();
      expect(onDoubleClickSlot).not.toHaveBeenCalled();
      expect(onSelectAppointment).not.toHaveBeenCalled();
      expect(onSelectSlot).not.toHaveBeenCalled();

      // With double clicks, the single-click select is debounced (100ms) so
      // the double-click handler can cancel it before it fires. Wait past the
      // debounce window to confirm the pending select was cancelled, not
      // merely delayed.
      await sleep(150);
      expect(onSelectAppointment).not.toHaveBeenCalled();
    });

    test('calls onSelectSlot after 100ms when clicking on a slot when a double-click handler is registered', async () => {
      const onSelectAppointment = vi.fn();
      const onDoubleClickAppointment = vi.fn();
      const onSelectSlot = vi.fn();
      const onDoubleClickSlot = vi.fn();
      setup({
        eventSources: [
          {
            appointments: [createAppointment()],
            slots: [createSlot()],
          },
        ],
        onSelectAppointment,
        onDoubleClickAppointment,
        onSelectSlot,
        onDoubleClickSlot,
      });

      await userEvent.click(screen.getByText('Available'));
      expect(onDoubleClickAppointment).not.toHaveBeenCalled();
      expect(onDoubleClickSlot).not.toHaveBeenCalled();
      expect(onSelectAppointment).not.toHaveBeenCalled();
      expect(onSelectSlot).not.toHaveBeenCalled();

      await sleep(100);
      expect(onSelectSlot).toHaveBeenCalled();
    });
  });

  describe('onRangeChange', () => {
    test('calls onRangeChange on initial render', async () => {
      const onRangeChange = vi.fn();
      setup({ eventSources: [], onRangeChange });
      expect(onRangeChange).toHaveBeenCalled();

      const range = onRangeChange.mock.calls[0][0];
      expect(range.start).toBeInstanceOf(Date);
      expect(range.end).toBeInstanceOf(Date);
      expect(range.end.getTime()).toBeGreaterThan(range.start.getTime());
    });

    test('calls onRangeChange when navigating', async () => {
      const onRangeChange = vi.fn();
      setup({ eventSources: [], onRangeChange });
      expect(onRangeChange).toHaveBeenCalled();

      const initialCallCount = onRangeChange.mock.calls.length;

      // Navigate to next period
      const nextButton = screen.getByLabelText('Next');
      await userEvent.click(nextButton);

      expect(onRangeChange.mock.calls.length).toBeGreaterThan(initialCallCount);
    });

    test('calls onRangeChange when switching views', async () => {
      const onRangeChange = vi.fn();
      setup({ eventSources: [], onRangeChange });
      expect(onRangeChange).toHaveBeenCalled();

      const initialCallCount = onRangeChange.mock.calls.length;

      // Switch to month view
      await userEvent.click(screen.getByText('Month'));
      expect(onRangeChange.mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });

  describe('availableTime prop', () => {
    test('renders no non-business-hours overlay when availableTime is not provided', async () => {
      const { container } = setup({ eventSources: [] });

      expect(container.querySelectorAll('.nonBusinessHours')).toHaveLength(0);
    });

    test('highlights days outside availableTime, and both sides of the day for partial availability', async () => {
      const { container } = setup({
        availableTime: [{ daysOfWeek: ['mon'], availableStartTime: '09:00:00', availableEndTime: '17:00:00' }],
        eventSources: [],
      });

      const cells = getWeekGridCells(container);
      expect(cells).toHaveLength(7);

      // DayIndexer order is [sun, mon, tue, wed, thu, fri, sat]
      const overlayCountsByDay = cells.map((cell) => cell.querySelectorAll('.nonBusinessHours').length);

      // Monday has business hours in the middle of the day, so it is bounded by
      // a non-business overlay both before 9am and after 5pm.
      expect(overlayCountsByDay[1]).toBe(2);

      // Every other day of the week has no availableTime entry at all, so the
      // entire day is a single non-business overlay.
      expect(overlayCountsByDay[0]).toBe(1);
      expect(overlayCountsByDay[2]).toBe(1);
      expect(overlayCountsByDay[3]).toBe(1);
      expect(overlayCountsByDay[4]).toBe(1);
      expect(overlayCountsByDay[5]).toBe(1);
      expect(overlayCountsByDay[6]).toBe(1);
    });

    test('does not highlight a day marked allDay', async () => {
      const { container } = setup({
        eventSources: [],
        availableTime: [{ daysOfWeek: ['fri'], allDay: true }],
      });

      const cells = getWeekGridCells(container);
      const overlayCountsByDay = cells.map((cell) => cell.querySelectorAll('.nonBusinessHours').length);

      // Friday is available all day, so it has no non-business overlay.
      expect(overlayCountsByDay[5]).toBe(0);

      // The rest of the week is still fully non-business.
      expect(overlayCountsByDay[0]).toBe(1);
      expect(overlayCountsByDay[1]).toBe(1);
      expect(overlayCountsByDay[2]).toBe(1);
      expect(overlayCountsByDay[3]).toBe(1);
      expect(overlayCountsByDay[4]).toBe(1);
      expect(overlayCountsByDay[6]).toBe(1);
    });

    test('combines multiple availableTime entries across days', async () => {
      const { container } = setup({
        eventSources: [],
        availableTime: [
          {
            daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri'],
            availableStartTime: '09:00:00',
            availableEndTime: '17:00:00',
          },
          { daysOfWeek: ['sat'], allDay: true },
        ],
      });

      const cells = getWeekGridCells(container);
      const overlayCountsByDay = cells.map((cell) => cell.querySelectorAll('.nonBusinessHours').length);

      expect(overlayCountsByDay).toEqual([
        1, // sun: not covered, fully non-business
        2, // mon: bounded before/after business hours
        2, // tue
        2, // wed
        2, // thu
        2, // fri
        0, // sat: allDay
      ]);
    });
  });

  describe('selection', () => {
    // A day the week view is already showing, so the highlight has somewhere to land.
    const visibleDay = (container: HTMLElement, index: number): { start: Date; end: Date } => {
      const date = getWeekGridCells(container)[index].getAttribute('data-date');
      const start = new Date(`${date}T10:00:00`);
      return { start, end: new Date(start.getTime() + 30 * 60 * 1000) };
    };

    const highlightedDays = (container: HTMLElement): number[] =>
      getWeekGridCells(container).flatMap((cell, index) => (cell.querySelector('.selectedRange') ? [index] : []));

    test('draws nothing until there is a selection', async () => {
      const { container } = setup({ eventSources: [], onSelectInterval: vi.fn() });

      expect(highlightedDays(container)).toEqual([]);
    });

    test('highlights an interval it was mounted with', async () => {
      // The week view opens on today, so a highlight there is one the calendar is
      // already showing — and mounting is the first chance it has to draw one.
      const { container } = setup({
        eventSources: [],
        onSelectInterval: vi.fn(),
        selection: { start: baseDate, end: new Date(baseDate.getTime() + 30 * 60 * 1000) },
      });

      expect(container.querySelectorAll('.selectedRange').length).toBeGreaterThan(0);
    });

    test('highlights the interval it is given, without reporting it back', async () => {
      const onSelectInterval = vi.fn();
      const { container, rerender } = setup({ eventSources: [], onSelectInterval });
      const wednesday = visibleDay(container, 3);

      rerender(<CalendarBase eventSources={[]} onSelectInterval={onSelectInterval} selection={wednesday} />);

      expect(highlightedDays(container)).toEqual([3]);
      // The calendar reports a selection it made itself through the same callback as
      // a click, and a host that stored it would hand it straight back.
      expect(onSelectInterval).not.toHaveBeenCalled();
    });

    test('moves the highlight when the selection changes', async () => {
      const onSelectInterval = vi.fn();
      const { container, rerender } = setup({ eventSources: [], onSelectInterval });
      const wednesday = visibleDay(container, 3);
      const friday = visibleDay(container, 5);

      rerender(<CalendarBase eventSources={[]} onSelectInterval={onSelectInterval} selection={wednesday} />);
      rerender(<CalendarBase eventSources={[]} onSelectInterval={onSelectInterval} selection={friday} />);

      // Moved, not added: one time is chosen at a time.
      expect(highlightedDays(container)).toEqual([5]);
      expect(onSelectInterval).not.toHaveBeenCalled();
    });

    test('takes the highlight down when the selection is cleared', async () => {
      const onSelectInterval = vi.fn();
      const { container, rerender } = setup({ eventSources: [], onSelectInterval });
      const wednesday = visibleDay(container, 3);

      rerender(<CalendarBase eventSources={[]} onSelectInterval={onSelectInterval} selection={wednesday} />);
      rerender(<CalendarBase eventSources={[]} onSelectInterval={onSelectInterval} selection={undefined} />);

      expect(highlightedDays(container)).toEqual([]);
    });

    test('ignores a selection on a calendar nothing can be selected on', async () => {
      const { container, rerender } = setup({ eventSources: [] });
      const wednesday = visibleDay(container, 3);

      rerender(<CalendarBase eventSources={[]} selection={wednesday} />);

      // No `onSelectInterval`, so the calendar is not selectable at all, and a
      // highlight nobody can move or clear is worse than none.
      expect(highlightedDays(container)).toEqual([]);
    });
  });
});
