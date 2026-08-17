// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { EventApi, EventClickInfo, EventSourceInput } from '@fullcalendar/react';
import { sleep } from '@medplum/core';
import type { Appointment, HealthcareServiceAvailableTime, Slot } from '@medplum/fhirtypes';
import { describe, expect, test, vi } from 'vitest';
import { render, screen, userEvent } from '../test-utils/render';
import type { DateTimeRange } from '../types';
import { CalendarBase } from './CalendarBase';

describe('CalendarBase', () => {
  // Use today's date to ensure appointments show in visible range
  const now = new Date();
  const baseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0);

  const setup = ({
    events,
    availableTime,
    eventClick,
    eventDoubleClick,
    onRangeChange,
  }: {
    events?: EventSourceInput;
    slots?: Slot[];
    appointments?: Appointment[];
    availableTime?: HealthcareServiceAvailableTime[];
    eventClick?: (eventInfo: EventClickInfo) => void;
    eventDoubleClick?: (event: EventApi) => void;
    onRangeChange?: (range: DateTimeRange) => void;
  } = {}): ReturnType<typeof render> => {
    return render(
      <CalendarBase
        events={events}
        availableTime={availableTime}
        eventClick={eventClick}
        eventDoubleClick={eventDoubleClick}
        onRangeChange={onRangeChange}
      />
    );
  };

  // Week view always lays out columns Sun..Sat regardless of which week is showing,
  // so day-of-week behavior can be asserted by position without depending on "today".
  const getWeekGridCells = (container: HTMLElement): Element[] =>
    Array.from(container.querySelectorAll('[role="gridcell"][data-date]'));

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
      const onRangeChange = vi.fn();
      setup({ onRangeChange });

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
    test('calls eventClick when clicking on an event', async () => {
      const eventClick = vi.fn();
      setup({
        events: [
          {
            title: 'Test Event One',
            start: baseDate.toISOString(),
            end: new Date(baseDate.getTime() + 30 * 60 * 1000).toISOString(),
          },
        ],
        eventClick,
      });
      await userEvent.click(screen.getByText('Test Event One'));
      expect(eventClick).toHaveBeenCalled();
    });

    test('calls eventDoubleClick when double clicking on an event', async () => {
      const eventClick = vi.fn();
      const eventDoubleClick = vi.fn();
      setup({
        events: [
          {
            title: 'Test Event One',
            start: baseDate.toISOString(),
            end: new Date(baseDate.getTime() + 30 * 60 * 1000).toISOString(),
          },
        ],
        eventClick,
        eventDoubleClick,
      });

      await userEvent.dblClick(screen.getByText('Test Event One'));
      expect(eventDoubleClick).toHaveBeenCalled();
      expect(eventClick).not.toHaveBeenCalled();

      // With eventDoubleClick, the single-click select is debounced (100ms) so
      // the double-click handler can cancel it before it fires. Wait past the
      // debounce window to confirm the pending select was cancelled, not
      // merely delayed.
      await sleep(150);
      expect(eventClick).not.toHaveBeenCalled();
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

  describe('availableTime prop', () => {
    test('renders no non-business-hours overlay when availableTime is not provided', async () => {
      const { container } = setup();

      expect(container.querySelectorAll('.nonBusinessHours')).toHaveLength(0);
    });

    test('highlights days outside availableTime, and both sides of the day for partial availability', async () => {
      const { container } = setup({
        availableTime: [{ daysOfWeek: ['mon'], availableStartTime: '09:00:00', availableEndTime: '17:00:00' }],
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
});
