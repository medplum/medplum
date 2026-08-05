// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { hasScheduleAvailability, resolveAvailability, SchedulingParametersURI } from '@medplum/core';
import type { Extension, HealthcareService, Schedule } from '@medplum/fhirtypes';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { ScheduleAvailabilityEditor } from './ScheduleAvailabilityEditor';
import {
  blankWeeklyAvailability,
  canAddRange,
  filterTimeOptions,
  formatMinutesOfDay,
  fromWeeklyAvailability,
  hasAnyAvailableDay,
  isTimeQuery,
  MINUTES_PER_DAY,
  nearestOption,
  nextDayOfWeek,
  nextRange,
  TIME_STEP_MINUTES,
  timeOptions,
  toWeeklyAvailability,
  typedTimes,
} from './ScheduleAvailabilityEditor.utils';

const service: WithId<HealthcareService> = {
  resourceType: 'HealthcareService',
  id: 'service-1',
  name: 'Follow-Up Visit',
};

// A service with native availableTime, used to exercise the inherited default path.
const serviceWithHours: WithId<HealthcareService> = {
  resourceType: 'HealthcareService',
  id: 'service-1',
  name: 'Follow-Up Visit',
  availableTime: [
    { daysOfWeek: ['mon', 'tue'], availableStartTime: '08:00:00', availableEndTime: '16:00:00' },
    { daysOfWeek: ['sat'], allDay: true },
  ],
};

function availableTime(day: string, start: string, end: string): Extension {
  return {
    url: 'availableTime',
    extension: [
      { url: 'daysOfWeek', valueCode: day },
      { url: 'availableStartTime', valueTime: start },
      { url: 'availableEndTime', valueTime: end },
    ],
  };
}

function scheduleWith(...availability: Extension[]): Schedule {
  return {
    resourceType: 'Schedule',
    id: 'schedule-1',
    actor: [{ reference: 'Practitioner/123' }],
    extension: [
      {
        url: SchedulingParametersURI,
        extension: [
          { url: 'service', valueReference: { reference: 'HealthcareService/service-1' } },
          { url: 'duration', valueDuration: { value: 30, unit: 'min' } },
          { url: 'availability', extension: availability },
        ],
      },
    ],
  };
}

// Schedule with a SchedulingParameters block for the service but no `availability`
// sub-extension, i.e. it inherits the service-level default.
function scheduleWithoutOverride(): Schedule {
  return {
    resourceType: 'Schedule',
    id: 'schedule-1',
    actor: [{ reference: 'Practitioner/123' }],
    extension: [
      {
        url: SchedulingParametersURI,
        extension: [
          { url: 'service', valueReference: { reference: 'HealthcareService/service-1' } },
          { url: 'duration', valueDuration: { value: 30, unit: 'min' } },
        ],
      },
    ],
  };
}

describe('ScheduleAvailabilityEditor utils', () => {
  test('toWeeklyAvailability pivots entries into per-day blocks', () => {
    const weekly = toWeeklyAvailability([
      { daysOfWeek: ['mon', 'wed'], availableStartTime: '09:00:00', availableEndTime: '12:00:00' },
      { daysOfWeek: ['mon'], availableStartTime: '13:00:00', availableEndTime: '17:00:00' },
      { daysOfWeek: ['sat'], allDay: true },
    ]);

    expect(weekly.mon).toEqual({
      available: true,
      ranges: [
        { start: 540, end: 720 },
        { start: 780, end: 1020 },
      ],
    });
    expect(weekly.wed).toEqual({ available: true, ranges: [{ start: 540, end: 720 }] });
    expect(weekly.sat).toEqual({ available: true, ranges: [{ start: 0, end: MINUTES_PER_DAY }] });
    expect(weekly.tue.available).toBe(false);
  });

  test('toWeeklyAvailability leaves a day off with default hours ready', () => {
    // Switching an unavailable day on should offer 9 to 5 rather than a blank row.
    expect(toWeeklyAvailability(undefined)).toEqual(blankWeeklyAvailability());
    expect(toWeeklyAvailability(undefined).tue).toEqual({ available: false, ranges: [{ start: 540, end: 1020 }] });
  });

  test('toWeeklyAvailability skips entries missing a start or end time', () => {
    expect(toWeeklyAvailability([{ daysOfWeek: ['mon'], availableStartTime: '09:00:00' }])).toEqual(
      blankWeeklyAvailability()
    );
    expect(toWeeklyAvailability([{ daysOfWeek: ['mon'], availableStartTime: 'not a time' }])).toEqual(
      blankWeeklyAvailability()
    );
  });

  test('toWeeklyAvailability splits a window running past midnight', () => {
    const weekly = toWeeklyAvailability([
      { daysOfWeek: ['fri'], availableStartTime: '22:00:00', availableEndTime: '06:00:00' },
    ]);

    expect(weekly.fri).toEqual({ available: true, ranges: [{ start: 1320, end: MINUTES_PER_DAY }] });
    expect(weekly.sat).toEqual({ available: true, ranges: [{ start: 0, end: 360 }] });
  });

  test('toWeeklyAvailability wraps a Sunday overnight window into Monday', () => {
    const weekly = toWeeklyAvailability([
      { daysOfWeek: ['sun'], availableStartTime: '20:00:00', availableEndTime: '02:00:00' },
    ]);

    expect(weekly.sun.ranges).toEqual([{ start: 1200, end: MINUTES_PER_DAY }]);
    expect(weekly.mon.ranges).toEqual([{ start: 0, end: 120 }]);
  });

  test('toWeeklyAvailability keeps a window ending exactly at midnight on one day', () => {
    const weekly = toWeeklyAvailability([
      { daysOfWeek: ['fri'], availableStartTime: '22:00:00', availableEndTime: '00:00:00' },
    ]);

    expect(weekly.fri.ranges).toEqual([{ start: 1320, end: MINUTES_PER_DAY }]);
    expect(weekly.sat.available).toBe(false);
  });

  test('toWeeklyAvailability reads a window ending at its start time as 24 hours from that start', () => {
    // Scheduling reads an end at or before the start as running into the next
    // day, so 9 AM to 9 AM is Monday morning through Tuesday morning, not a
    // Monday that starts at midnight.
    const weekly = toWeeklyAvailability([
      { daysOfWeek: ['mon'], availableStartTime: '09:00:00', availableEndTime: '09:00:00' },
    ]);

    expect(weekly.mon).toEqual({ available: true, ranges: [{ start: 540, end: MINUTES_PER_DAY }] });
    expect(weekly.tue).toEqual({ available: true, ranges: [{ start: 0, end: 540 }] });
  });

  test('toWeeklyAvailability reads midnight to midnight as the one full day it is', () => {
    // The one start for which 24 hours falls inside a single day, and how
    // around-the-clock availability is written without the allDay flag.
    const weekly = toWeeklyAvailability([
      { daysOfWeek: ['mon'], availableStartTime: '00:00:00', availableEndTime: '00:00:00' },
    ]);

    expect(weekly.mon).toEqual({ available: true, ranges: [{ start: 0, end: MINUTES_PER_DAY }] });
    expect(weekly.tue.available).toBe(false);
  });

  test('toWeeklyAvailability sorts and merges blocks the editor cannot show side by side', () => {
    const weekly = toWeeklyAvailability([
      { daysOfWeek: ['mon'], availableStartTime: '13:00:00', availableEndTime: '15:00:00' },
      { daysOfWeek: ['mon'], availableStartTime: '09:00:00', availableEndTime: '14:00:00' },
      { daysOfWeek: ['mon'], availableStartTime: '18:00:00', availableEndTime: '20:00:00' },
    ]);

    expect(weekly.mon.ranges).toEqual([
      { start: 540, end: 900 },
      { start: 1080, end: 1200 },
    ]);
  });

  test('toWeeklyAvailability rounds sub-minute precision', () => {
    const weekly = toWeeklyAvailability([
      { daysOfWeek: ['mon'], availableStartTime: '09:00:30.500', availableEndTime: '17:00:00' },
    ]);

    expect(weekly.mon.ranges).toEqual([{ start: 541, end: 1020 }]);
  });

  test('fromWeeklyAvailability emits one entry per block and round-trips', () => {
    const weekly = blankWeeklyAvailability();
    weekly.mon = {
      available: true,
      ranges: [
        { start: 540, end: 720 },
        { start: 780, end: 1020 },
      ],
    };
    weekly.sat = { available: true, ranges: [{ start: 0, end: MINUTES_PER_DAY }] };
    // Hours on a day that is unavailable are kept for later, not written out.
    weekly.sun = { available: false, ranges: [{ start: 540, end: 1020 }] };

    expect(fromWeeklyAvailability(weekly)).toEqual([
      { daysOfWeek: ['mon'], availableStartTime: '09:00:00', availableEndTime: '12:00:00' },
      { daysOfWeek: ['mon'], availableStartTime: '13:00:00', availableEndTime: '17:00:00' },
      { daysOfWeek: ['sat'], allDay: true },
    ]);
    expect(toWeeklyAvailability(fromWeeklyAvailability(weekly))).toEqual(weekly);
  });

  test('fromWeeklyAvailability writes a block ending at midnight as midnight', () => {
    const weekly = blankWeeklyAvailability();
    weekly.fri = { available: true, ranges: [{ start: 1320, end: MINUTES_PER_DAY }] };

    expect(fromWeeklyAvailability(weekly)).toEqual([
      { daysOfWeek: ['fri'], availableStartTime: '22:00:00', availableEndTime: '00:00:00' },
    ]);
  });

  test('hasAnyAvailableDay is false only when every day is unavailable', () => {
    expect(hasAnyAvailableDay(blankWeeklyAvailability())).toBe(false);

    const withHours = blankWeeklyAvailability();
    withHours.fri = { available: true, ranges: [{ start: 540, end: 1020 }] };
    expect(hasAnyAvailableDay(withHours)).toBe(true);
  });

  test('nextDayOfWeek advances and wraps at the end of the week', () => {
    expect(nextDayOfWeek('mon')).toBe('tue');
    expect(nextDayOfWeek('sat')).toBe('sun');
    expect(nextDayOfWeek('sun')).toBe('mon');
  });

  test('formatMinutesOfDay reads both midnights as 12:00 AM', () => {
    expect(formatMinutesOfDay(0)).toBe('12:00 AM');
    expect(formatMinutesOfDay(MINUTES_PER_DAY)).toBe('12:00 AM');
    expect(formatMinutesOfDay(540)).toBe('9:00 AM');
    expect(formatMinutesOfDay(725)).toBe('12:05 PM');
    expect(formatMinutesOfDay(1020)).toBe('5:00 PM');
  });

  test('timeOptions steps by a quarter hour between the bounds', () => {
    expect(timeOptions(540, 585)).toEqual([540, 555, 570, 585]);
    expect(timeOptions(0, MINUTES_PER_DAY)).toHaveLength(97);
    expect(timeOptions(1020, 1020)).toEqual([1020]);
  });

  test('timeOptions measures the interval from midnight, not from the bound', () => {
    // A bound off the interval narrows the list without shifting the times in
    // it, so a block stored as 9:07 still offers 9:15 rather than 9:22.
    expect(timeOptions(547, 600)).toEqual([555, 570, 585, 600]);
    // Midnight stays reachable, which it would not be by stepping from 552.
    expect(timeOptions(552, MINUTES_PER_DAY)).toContain(MINUTES_PER_DAY);
  });

  test('timeOptions offers a time off the interval when asked to', () => {
    // The current value and a time typed in full are both worth listing even
    // though the interval would skip them.
    expect(timeOptions(540, 600, [547])).toEqual([540, 547, 555, 570, 585, 600]);
    // Listing one is not a way around the bounds of the row.
    expect(timeOptions(540, 600, [10, 700])).toEqual([540, 555, 570, 585, 600]);
    // Nor a way to list it twice.
    expect(timeOptions(540, 600, [555])).toEqual([540, 555, 570, 585, 600]);
  });

  test('typedTimes reads a time typed in full, and nothing less', () => {
    // Both readings, since nothing said which.
    expect(typedTimes('303').map(formatMinutesOfDay)).toEqual(['3:03 AM', '3:03 PM']);
    expect(typedTimes('3:03 pm').map(formatMinutesOfDay)).toEqual(['3:03 PM']);
    // A partial minute still names a range of times, which the list narrows to.
    expect(typedTimes('30')).toEqual([]);
    expect(typedTimes('3')).toEqual([]);
    expect(typedTimes('')).toEqual([]);
    // 3:99 is not a time.
    expect(typedTimes('399')).toEqual([]);
  });

  test('nearestOption finds where an off-interval time sits in the list', () => {
    expect(nearestOption(timeOptions(0, MINUTES_PER_DAY), 547)).toBe(540);
    expect(nearestOption([], 547)).toBeUndefined();
  });

  test('filterTimeOptions returns everything when nothing is typed', () => {
    const options = timeOptions(0, MINUTES_PER_DAY);
    expect(filterTimeOptions(options, '', 540)).toBe(options);
    expect(filterTimeOptions(options, 'abc', 540)).toBe(options);
  });

  test('filterTimeOptions matches on the hour and leads with the nearest one', () => {
    const options = timeOptions(0, MINUTES_PER_DAY);

    // "9" is both 9 AM and 9 PM; the reading nearer the current value comes first.
    expect(filterTimeOptions(options, '9', 480)[0]).toBe(540);
    expect(filterTimeOptions(options, '9', 1300)[0]).toBe(1260);
    // Both readings are still reachable further down the list.
    expect(filterTimeOptions(options, '9', 480)).toContain(1260);
  });

  test('filterTimeOptions narrows as minutes are typed', () => {
    const options = timeOptions(0, MINUTES_PER_DAY);

    expect(filterTimeOptions(options, '930', 540).map(formatMinutesOfDay)).toEqual(['9:30 AM', '9:30 PM']);
    expect(filterTimeOptions(options, '9:30 pm', 540).map(formatMinutesOfDay)).toEqual(['9:30 PM']);
    expect(filterTimeOptions(options, '930a', 540).map(formatMinutesOfDay)).toEqual(['9:30 AM']);
  });

  test('filterTimeOptions reads a leading zero as padding, not as an hour', () => {
    const options = timeOptions(0, MINUTES_PER_DAY);

    // There is no hour 0 on a 12 hour clock, so a leading zero can only be
    // padding: "0930" is 9:30, the way a clock face writes it.
    expect(filterTimeOptions(options, '0930', 540).map(formatMinutesOfDay)).toEqual(['9:30 AM', '9:30 PM']);
    expect(filterTimeOptions(options, '09', 540)[0]).toBe(540);
    expect(typedTimes('0930').map(formatMinutesOfDay)).toEqual(['9:30 AM', '9:30 PM']);
  });

  test('isTimeQuery tells a query that narrows the list from one that does not', () => {
    // Narrowing to nothing is still narrowing; naming no time at all is not.
    expect(isTimeQuery('9')).toBe(true);
    expect(isTimeQuery('0930')).toBe(true);
    expect(isTimeQuery('99')).toBe(true);
    expect(isTimeQuery('')).toBe(false);
    expect(isTimeQuery('noon')).toBe(false);
    expect(isTimeQuery('0')).toBe(false);
  });

  test('filterTimeOptions reads a leading 1 as both an hour and a prefix', () => {
    const formatted = filterTimeOptions(timeOptions(0, MINUTES_PER_DAY), '11', 0).map(formatMinutesOfDay);

    // 11 o'clock is the more complete reading, so it leads; 1:1x follows.
    expect(formatted[0]).toBe('11:00 AM');
    expect(formatted).toContain('1:15 AM');
  });

  test('filterTimeOptions stays within the offered options', () => {
    // Afternoon only, so a morning match has nothing to return.
    expect(filterTimeOptions(timeOptions(780, MINUTES_PER_DAY), '9a', 780)).toEqual([]);
  });

  test('canAddRange is false once a day runs to midnight', () => {
    expect(canAddRange([{ start: 540, end: 1020 }])).toBe(true);
    expect(canAddRange([{ start: 540, end: MINUTES_PER_DAY }])).toBe(false);
    expect(canAddRange([])).toBe(false);
  });

  test('nextRange opens an hour after the previous block and clamps to midnight', () => {
    expect(nextRange([{ start: 540, end: 720 }])).toEqual({ start: 780, end: 840 });
    expect(nextRange([{ start: 540, end: MINUTES_PER_DAY - 20 }])).toEqual({
      start: MINUTES_PER_DAY - TIME_STEP_MINUTES,
      end: MINUTES_PER_DAY,
    });
  });

  test('nextRange lands on the interval even after a block that does not', () => {
    // 12:07 PM plus an hour is 1:07 PM, which is not on the list.
    expect(nextRange([{ start: 540, end: 727 }])).toEqual({ start: 795, end: 855 });
  });
});

describe('ScheduleAvailabilityEditor component', () => {
  function setup(
    schedule: Schedule,
    onSave = vi.fn(),
    onCancel = vi.fn(),
    svc: WithId<HealthcareService> = service,
    timezone?: string
  ): { onSave: any; onCancel: any } {
    render(
      <ScheduleAvailabilityEditor
        schedule={schedule}
        service={svc}
        timezone={timezone}
        onCancel={onCancel}
        onSave={onSave}
      />
    );
    return { onSave, onCancel };
  }

  function save(): Promise<void> {
    return act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));
    });
  }

  // Opens a time picker and chooses the option with the given display text.
  async function pickTime(testId: string, option: string): Promise<void> {
    await act(async () => {
      fireEvent.focus(screen.getByTestId(testId));
    });
    await act(async () => {
      fireEvent.click(screen.getByText(option));
    });
  }

  // Types into a time picker and tabs away without picking from the list.
  async function typeTimeAndLeave(testId: string, text: string): Promise<void> {
    const input = screen.getByTestId(testId);
    await act(async () => {
      fireEvent.focus(input);
    });
    await act(async () => {
      fireEvent.change(input, { target: { value: text } });
    });
    await act(async () => {
      fireEvent.blur(input);
    });
  }

  test('renders existing availability and saves an updated Schedule', async () => {
    const { onSave } = setup(scheduleWith(availableTime('mon', '09:00:00', '17:00:00')));

    expect(screen.getByTestId('schedule-availability-start-mon-0')).toHaveValue('9:00 AM');
    expect(screen.getByTestId('schedule-availability-end-mon-0')).toHaveValue('5:00 PM');

    await save();

    expect(onSave).toHaveBeenCalledTimes(1);
    const updated: Schedule = onSave.mock.calls[0][0];
    expect(resolveAvailability(service, updated)).toEqual([
      { daysOfWeek: ['mon'], availableStartTime: '09:00:00', availableEndTime: '17:00:00' },
    ]);
  });

  test('lists the days starting on Sunday', () => {
    setup(scheduleWith(availableTime('mon', '09:00:00', '17:00:00')));

    const days = screen.getAllByRole('switch').map((el) => el.getAttribute('aria-label'));
    expect(days).toEqual([
      'Enable custom availability for Follow-Up Visit',
      'Available on Sunday',
      'Available on Monday',
      'Available on Tuesday',
      'Available on Wednesday',
      'Available on Thursday',
      'Available on Friday',
      'Available on Saturday',
    ]);
  });

  test('toggling a day on adds default hours and saves them', async () => {
    const { onSave } = setup(scheduleWith(availableTime('mon', '09:00:00', '17:00:00')));

    expect(screen.queryByTestId('schedule-availability-start-tue-0')).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByTestId('schedule-availability-switch-tue'));
    });
    expect(screen.getByTestId('schedule-availability-start-tue-0')).toHaveValue('9:00 AM');

    await save();

    const updated: Schedule = onSave.mock.calls[0][0];
    expect(resolveAvailability(service, updated)).toEqual([
      { daysOfWeek: ['mon'], availableStartTime: '09:00:00', availableEndTime: '17:00:00' },
      { daysOfWeek: ['tue'], availableStartTime: '09:00:00', availableEndTime: '17:00:00' },
    ]);
  });

  test('toggling a day off keeps its hours for when it comes back on', async () => {
    setup(scheduleWith(availableTime('mon', '10:00:00', '14:00:00')));

    await act(async () => {
      fireEvent.click(screen.getByTestId('schedule-availability-switch-mon'));
    });
    expect(screen.queryByTestId('schedule-availability-start-mon-0')).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByTestId('schedule-availability-switch-mon'));
    });
    expect(screen.getByTestId('schedule-availability-start-mon-0')).toHaveValue('10:00 AM');
  });

  test('supports adding and removing blocks of hours in a day', async () => {
    const { onSave } = setup(scheduleWith(availableTime('mon', '09:00:00', '12:00:00')));

    await act(async () => {
      fireEvent.click(screen.getByTestId('schedule-availability-add-mon'));
    });
    // A new block opens an hour after the previous one ends.
    expect(screen.getByTestId('schedule-availability-start-mon-1')).toHaveValue('1:00 PM');
    expect(screen.getByTestId('schedule-availability-end-mon-1')).toHaveValue('2:00 PM');

    await pickTime('schedule-availability-end-mon-1', '5:00 PM');
    await save();

    const updated: Schedule = onSave.mock.calls[0][0];
    expect(resolveAvailability(service, updated)).toEqual([
      { daysOfWeek: ['mon'], availableStartTime: '09:00:00', availableEndTime: '12:00:00' },
      { daysOfWeek: ['mon'], availableStartTime: '13:00:00', availableEndTime: '17:00:00' },
    ]);
  });

  test('removes a block of hours', async () => {
    const { onSave } = setup(
      scheduleWith(availableTime('mon', '09:00:00', '12:00:00'), availableTime('mon', '13:00:00', '17:00:00'))
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('schedule-availability-remove-mon-0'));
    });

    expect(screen.getByTestId('schedule-availability-start-mon-0')).toHaveValue('1:00 PM');
    expect(screen.queryByTestId('schedule-availability-start-mon-1')).toBeNull();
    // The remove button goes away once a single block is left.
    expect(screen.queryByTestId('schedule-availability-remove-mon-0')).toBeNull();

    await save();
    const updated: Schedule = onSave.mock.calls[0][0];
    expect(resolveAvailability(service, updated)).toEqual([
      { daysOfWeek: ['mon'], availableStartTime: '13:00:00', availableEndTime: '17:00:00' },
    ]);
  });

  test('offers only the hours left after the previous block', async () => {
    setup(scheduleWith(availableTime('mon', '09:00:00', '12:00:00'), availableTime('mon', '13:00:00', '17:00:00')));

    await act(async () => {
      fireEvent.focus(screen.getByTestId('schedule-availability-start-mon-1'));
    });

    // The second block cannot start before the first one ends.
    expect(screen.queryByText('11:00 AM')).toBeNull();
    expect(screen.getByText('12:00 PM')).toBeDefined();
  });

  test('offers times up to midnight on the last block', async () => {
    setup(scheduleWith(availableTime('mon', '09:00:00', '17:00:00')));

    await act(async () => {
      fireEvent.focus(screen.getByTestId('schedule-availability-end-mon-0'));
    });

    expect(screen.getByText('11:45 PM')).toBeDefined();
    expect(screen.getByText('12:00 AM')).toBeDefined();
  });

  test('an end time cannot be set before its start time', async () => {
    setup(scheduleWith(availableTime('mon', '09:00:00', '17:00:00')));

    await act(async () => {
      fireEvent.focus(screen.getByTestId('schedule-availability-end-mon-0'));
    });

    // Overnight windows are no longer authorable, so nothing earlier than the
    // start time is on offer.
    expect(screen.queryByText('8:00 AM')).toBeNull();
    expect(screen.getByText('9:15 AM')).toBeDefined();
  });

  test('a start can be set past its own end, moving the end an hour out', async () => {
    const { onSave } = setup(scheduleWith(availableTime('mon', '09:00:00', '12:00:00')));

    await pickTime('schedule-availability-start-mon-0', '2:00 PM');

    // The new start is accepted rather than refused, and the end follows it by
    // an hour regardless of how long the block was before.
    expect(screen.getByTestId('schedule-availability-start-mon-0')).toHaveValue('2:00 PM');
    expect(screen.getByTestId('schedule-availability-end-mon-0')).toHaveValue('3:00 PM');

    await save();
    const updated: Schedule = onSave.mock.calls[0][0];
    expect(resolveAvailability(service, updated)).toEqual([
      { daysOfWeek: ['mon'], availableStartTime: '14:00:00', availableEndTime: '15:00:00' },
    ]);
  });

  test('a start moved late in the day stops the end at midnight', async () => {
    setup(scheduleWith(availableTime('mon', '09:00:00', '12:00:00')));

    await pickTime('schedule-availability-start-mon-0', '11:45 PM');

    expect(screen.getByTestId('schedule-availability-end-mon-0')).toHaveValue('12:00 AM');
  });

  test('a start moved earlier leaves the end where it is', async () => {
    setup(scheduleWith(availableTime('mon', '09:00:00', '12:00:00')));

    await pickTime('schedule-availability-start-mon-0', '8:00 AM');

    expect(screen.getByTestId('schedule-availability-end-mon-0')).toHaveValue('12:00 PM');
    expect(screen.getByTestId('schedule-availability-end-mon-0')).not.toHaveAttribute('data-flashing');
  });

  test('flashes the end time when the editor moves it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      setup(scheduleWith(availableTime('mon', '09:00:00', '12:00:00')));

      await pickTime('schedule-availability-start-mon-0', '2:00 PM');
      expect(screen.getByTestId('schedule-availability-end-mon-0')).toHaveAttribute('data-flashing');

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.getByTestId('schedule-availability-end-mon-0')).not.toHaveAttribute('data-flashing');
    } finally {
      vi.useRealTimers();
    }
  });

  test('a second move restarts the flash rather than being swallowed by the first', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      setup(scheduleWith(availableTime('mon', '09:00:00', '12:00:00')));

      await pickTime('schedule-availability-start-mon-0', '2:00 PM');
      await act(async () => {
        vi.advanceTimersByTime(500);
      });
      await pickTime('schedule-availability-start-mon-0', '4:00 PM');

      // Past the point the first flash would have ended, but not the second.
      await act(async () => {
        vi.advanceTimersByTime(500);
      });
      expect(screen.getByTestId('schedule-availability-end-mon-0')).toHaveAttribute('data-flashing');
    } finally {
      vi.useRealTimers();
    }
  });

  test('announces an end time the editor moves', async () => {
    setup(scheduleWith(availableTime('mon', '09:00:00', '12:00:00')));

    const announcement = screen.getByTestId('schedule-availability-announcement');
    expect(announcement).toHaveAttribute('aria-live', 'polite');
    expect(announcement).toBeEmptyDOMElement();

    await pickTime('schedule-availability-start-mon-0', '2:00 PM');

    // The flash is only visible, so the same change is spoken.
    expect(announcement).toHaveTextContent('Monday block 1 end time changed to 3:00 PM.');
  });

  test('says nothing when the end time was not moved', async () => {
    setup(scheduleWith(availableTime('mon', '09:00:00', '12:00:00')));

    await pickTime('schedule-availability-start-mon-0', '8:00 AM');

    expect(screen.getByTestId('schedule-availability-announcement')).toBeEmptyDOMElement();
  });

  test('a start may be picked past the end, up to 11:45 PM', async () => {
    setup(scheduleWith(availableTime('mon', '09:00:00', '12:00:00')));

    await act(async () => {
      fireEvent.focus(screen.getByTestId('schedule-availability-start-mon-0'));
    });

    // Not capped at the current end time of 12:00 PM.
    expect(screen.getByText('6:00 PM')).toBeDefined();
    expect(screen.getByText('11:45 PM')).toBeDefined();
  });

  test('typing filters the times on offer', async () => {
    setup(scheduleWith(availableTime('mon', '09:00:00', '17:00:00')));

    await act(async () => {
      fireEvent.focus(screen.getByTestId('schedule-availability-start-mon-0'));
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId('schedule-availability-start-mon-0'), { target: { value: '730a' } });
    });

    expect(screen.getByText('7:30 AM')).toBeDefined();
    expect(screen.queryByText('9:00 AM')).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByText('7:30 AM'));
    });
    expect(screen.getByTestId('schedule-availability-start-mon-0')).toHaveValue('7:30 AM');
  });

  test('takes a typed time when the field is tabbed out of', async () => {
    const { onSave } = setup(scheduleWith(availableTime('mon', '09:00:00', '17:00:00')));

    await typeTimeAndLeave('schedule-availability-end-mon-0', '630p');

    expect(screen.getByTestId('schedule-availability-end-mon-0')).toHaveValue('6:30 PM');

    await save();
    const updated: Schedule = onSave.mock.calls[0][0];
    expect(resolveAvailability(service, updated)).toEqual([
      { daysOfWeek: ['mon'], availableStartTime: '09:00:00', availableEndTime: '18:30:00' },
    ]);
  });

  test('leaves the time alone when nothing was typed, or nothing matched', async () => {
    setup(scheduleWith(availableTime('mon', '09:00:00', '17:00:00')));

    // Focused and left without typing.
    await typeTimeAndLeave('schedule-availability-end-mon-0', '');
    expect(screen.getByTestId('schedule-availability-end-mon-0')).toHaveValue('5:00 PM');

    // Typed something no time can match.
    await typeTimeAndLeave('schedule-availability-end-mon-0', '99');
    expect(screen.getByTestId('schedule-availability-end-mon-0')).toHaveValue('5:00 PM');
  });

  test('leaves the time alone when what was typed names no time at all', async () => {
    setup(scheduleWith(availableTime('mon', '09:00:00', '17:00:00')));

    // These narrow the list to nothing rather than to no time in particular, so
    // there is no highlighted time to take. Taking the top of an unnarrowed list
    // would move the row to the earliest hour still free that day.
    for (const query of ['noon', 'abc', '0', 'a']) {
      await typeTimeAndLeave('schedule-availability-end-mon-0', query);
      expect(screen.getByTestId('schedule-availability-end-mon-0')).toHaveValue('5:00 PM');
    }
  });

  test('takes a time typed with a leading zero when the field is tabbed out of', async () => {
    const { onSave } = setup(scheduleWith(availableTime('mon', '09:00:00', '17:00:00')));

    await typeTimeAndLeave('schedule-availability-end-mon-0', '0630p');
    expect(screen.getByTestId('schedule-availability-end-mon-0')).toHaveValue('6:30 PM');

    await save();
    expect(resolveAvailability(service, onSave.mock.calls[0][0])).toEqual([
      { daysOfWeek: ['mon'], availableStartTime: '09:00:00', availableEndTime: '18:30:00' },
    ]);
  });

  test('a typed time outside the bounds of its row is not taken', async () => {
    setup(scheduleWith(availableTime('mon', '09:00:00', '17:00:00')));

    // 8 AM is before this block starts, so it is not among the times on offer
    // and tabbing away leaves the end time as it was. Taking a typed time can
    // never put a row outside its bounds, so no error state is needed.
    await typeTimeAndLeave('schedule-availability-end-mon-0', '8a');
    expect(screen.getByTestId('schedule-availability-end-mon-0')).toHaveValue('5:00 PM');
  });

  test('picking from the list changes the time exactly once', async () => {
    const onChange = vi.fn();
    setup(scheduleWith(availableTime('mon', '09:00:00', '17:00:00')), onChange);

    // Typing then clicking an option must not also commit on the blur that
    // follows the click.
    const input = screen.getByTestId('schedule-availability-end-mon-0');
    await act(async () => {
      fireEvent.focus(input);
    });
    await act(async () => {
      fireEvent.change(input, { target: { value: '630p' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByText('6:30 PM'));
    });

    expect(input).toHaveValue('6:30 PM');
    await save();
    expect(resolveAvailability(service, onChange.mock.calls[0][0])).toEqual([
      { daysOfWeek: ['mon'], availableStartTime: '09:00:00', availableEndTime: '18:30:00' },
    ]);
  });

  test('says so when a typed time matches nothing', async () => {
    setup(scheduleWith(availableTime('mon', '09:00:00', '17:00:00')));

    await act(async () => {
      fireEvent.focus(screen.getByTestId('schedule-availability-end-mon-0'));
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId('schedule-availability-end-mon-0'), { target: { value: '8a' } });
    });

    expect(screen.getByText('No matching time')).toBeDefined();
  });

  test('saves a full day as the allDay flag', async () => {
    const { onSave } = setup(scheduleWith(availableTime('mon', '09:00:00', '17:00:00')));

    await pickTime('schedule-availability-start-mon-0', '12:00 AM');
    await pickTime('schedule-availability-end-mon-0', '12:00 AM');
    await save();

    const updated: Schedule = onSave.mock.calls[0][0];
    expect(resolveAvailability(service, updated)).toEqual([{ daysOfWeek: ['mon'], allDay: true }]);
  });

  test('reads stored allDay hours back as a full day', () => {
    const schedule = scheduleWith({
      url: 'availableTime',
      extension: [
        { url: 'daysOfWeek', valueCode: 'mon' },
        { url: 'allDay', valueBoolean: true },
      ],
    });
    setup(schedule);

    expect(screen.getByTestId('schedule-availability-start-mon-0')).toHaveValue('12:00 AM');
    expect(screen.getByTestId('schedule-availability-end-mon-0')).toHaveValue('12:00 AM');
  });

  test('splits stored overnight hours across the two days', async () => {
    const { onSave } = setup(scheduleWith(availableTime('fri', '22:00:00', '06:00:00')));

    expect(screen.getByTestId('schedule-availability-start-fri-0')).toHaveValue('10:00 PM');
    expect(screen.getByTestId('schedule-availability-end-fri-0')).toHaveValue('12:00 AM');
    expect(screen.getByTestId('schedule-availability-start-sat-0')).toHaveValue('12:00 AM');
    expect(screen.getByTestId('schedule-availability-end-sat-0')).toHaveValue('6:00 AM');

    // Saving without edits keeps the same bookable hours, in the split form.
    await save();
    const updated: Schedule = onSave.mock.calls[0][0];
    expect(resolveAvailability(service, updated)).toEqual([
      { daysOfWeek: ['fri'], availableStartTime: '22:00:00', availableEndTime: '00:00:00' },
      { daysOfWeek: ['sat'], availableStartTime: '00:00:00', availableEndTime: '06:00:00' },
    ]);
  });

  test('shows a stored time that is off the picker interval, as stored', async () => {
    const { onSave } = setup(scheduleWith(availableTime('mon', '09:07:00', '17:00:00')));

    // Shown as stored rather than rounded to something nobody asked for.
    expect(screen.getByTestId('schedule-availability-start-mon-0')).toHaveValue('9:07 AM');
    expect(screen.getByTestId('schedule-availability-end-mon-0')).toHaveValue('5:00 PM');

    // Saving without touching it keeps the stored time.
    await save();
    const updated: Schedule = onSave.mock.calls[0][0];
    expect(resolveAvailability(service, updated)).toEqual([
      { daysOfWeek: ['mon'], availableStartTime: '09:07:00', availableEndTime: '17:00:00' },
    ]);
  });

  test('lists a time off the interval when it is the one selected', async () => {
    setup(scheduleWith(availableTime('mon', '09:07:00', '17:00:00')));

    await act(async () => {
      fireEvent.focus(screen.getByTestId('schedule-availability-start-mon-0'));
    });

    // The current time is on the list, so it reads as chosen rather than unset,
    // while the interval around it is measured from midnight as usual.
    expect(screen.getByText('9:07 AM')).toBeDefined();
    expect(screen.getByText('9:15 AM')).toBeDefined();
    expect(screen.queryByText('9:22 AM')).toBeNull();
  });

  test('an off-interval time does not shift the times on offer', async () => {
    setup(scheduleWith(availableTime('mon', '09:07:00', '17:00:00')));

    await act(async () => {
      fireEvent.focus(screen.getByTestId('schedule-availability-end-mon-0'));
    });

    // Measured from midnight, not from 9:07, and midnight is still reachable.
    expect(screen.getByText('9:15 AM')).toBeDefined();
    expect(screen.queryByText('9:22 AM')).toBeNull();
    expect(screen.getByText('12:00 AM')).toBeDefined();
  });

  test('offers a time typed in full even though the list would skip it', async () => {
    const { onSave } = setup(scheduleWith(availableTime('mon', '09:00:00', '17:00:00')));

    const input = screen.getByTestId('schedule-availability-end-mon-0');
    await act(async () => {
      fireEvent.focus(input);
    });
    await act(async () => {
      fireEvent.change(input, { target: { value: '3:03 pm' } });
    });

    // The quarter hours either side are gone, filtered out by the query, and
    // the time asked for is there to be picked.
    expect(screen.getByText('3:03 PM')).toBeDefined();
    expect(screen.queryByText('3:00 PM')).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByText('3:03 PM'));
    });
    expect(input).toHaveValue('3:03 PM');

    await save();
    const updated: Schedule = onSave.mock.calls[0][0];
    expect(resolveAvailability(service, updated)).toEqual([
      { daysOfWeek: ['mon'], availableStartTime: '09:00:00', availableEndTime: '15:03:00' },
    ]);
  });

  test('a typed time still has to fall within the bounds of its row', async () => {
    setup(scheduleWith(availableTime('mon', '09:00:00', '12:00:00'), availableTime('mon', '13:00:00', '17:00:00')));

    const input = screen.getByTestId('schedule-availability-end-mon-0');
    await act(async () => {
      fireEvent.focus(input);
    });
    await act(async () => {
      // Inside the block that follows, so offering it would be offering an
      // overlap. Typing a time in full reaches past the list, not the bounds.
      fireEvent.change(input, { target: { value: '5:03 pm' } });
    });

    expect(screen.queryByText('5:03 PM')).toBeNull();
    expect(screen.getByText('No matching time')).toBeDefined();
  });

  test('editing an off-interval time replaces it with the one chosen', async () => {
    const { onSave } = setup(scheduleWith(availableTime('mon', '09:07:00', '17:00:00')));

    await pickTime('schedule-availability-start-mon-0', '9:15 AM');

    expect(screen.getByTestId('schedule-availability-start-mon-0')).toHaveValue('9:15 AM');

    await save();
    const updated: Schedule = onSave.mock.calls[0][0];
    expect(resolveAvailability(service, updated)).toEqual([
      { daysOfWeek: ['mon'], availableStartTime: '09:15:00', availableEndTime: '17:00:00' },
    ]);
  });

  test('Cancel does not call onSave', async () => {
    const { onSave, onCancel } = setup(scheduleWith(availableTime('mon', '09:00:00', '17:00:00')));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    });
    expect(onSave).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  test('omits the Cancel button when no onCancel is given', () => {
    render(
      <ScheduleAvailabilityEditor
        schedule={scheduleWith(availableTime('mon', '09:00:00', '17:00:00'))}
        service={service}
        onSave={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });

  test('seeds from the service default with the override switch off', () => {
    setup(scheduleWithoutOverride(), vi.fn(), vi.fn(), serviceWithHours);

    expect(screen.getByTestId('schedule-availability-enable')).not.toBeChecked();
    // Monday is seeded from the service default hours, but is not editable.
    expect(screen.getByTestId('schedule-availability-start-mon-0')).toHaveValue('8:00 AM');
    expect(screen.getByTestId('schedule-availability-start-mon-0')).toBeDisabled();
    expect(screen.getByTestId('schedule-availability-switch-wed')).toBeDisabled();
    expect(screen.getByTestId('schedule-availability-reset')).toBeDisabled();
  });

  test('saving while inheriting clears any override', async () => {
    const { onSave } = setup(scheduleWithoutOverride(), vi.fn(), vi.fn(), serviceWithHours);

    await save();

    const updated: Schedule = onSave.mock.calls[0][0];
    expect(hasScheduleAvailability(updated, serviceWithHours)).toBe(false);
  });

  test('switching custom availability on creates an override', async () => {
    const { onSave } = setup(scheduleWithoutOverride(), vi.fn(), vi.fn(), serviceWithHours);

    await act(async () => {
      fireEvent.click(screen.getByTestId('schedule-availability-enable'));
    });
    expect(screen.getByTestId('schedule-availability-switch-wed')).toBeEnabled();

    await act(async () => {
      fireEvent.click(screen.getByTestId('schedule-availability-switch-wed'));
    });
    await save();

    const updated: Schedule = onSave.mock.calls[0][0];
    expect(hasScheduleAvailability(updated, serviceWithHours)).toBe(true);
    expect(resolveAvailability(serviceWithHours, updated)).toEqual([
      { daysOfWeek: ['mon'], availableStartTime: '08:00:00', availableEndTime: '16:00:00' },
      { daysOfWeek: ['tue'], availableStartTime: '08:00:00', availableEndTime: '16:00:00' },
      { daysOfWeek: ['wed'], availableStartTime: '09:00:00', availableEndTime: '17:00:00' },
      { daysOfWeek: ['sat'], allDay: true },
    ]);
  });

  test('switching custom availability off discards the override and shows the default', async () => {
    const { onSave } = setup(
      scheduleWith(availableTime('mon', '09:00:00', '17:00:00')),
      vi.fn(),
      vi.fn(),
      serviceWithHours
    );

    expect(screen.getByTestId('schedule-availability-enable')).toBeChecked();

    await act(async () => {
      fireEvent.click(screen.getByTestId('schedule-availability-enable'));
    });

    // The greyed out hours are the service default that is now back in effect.
    expect(screen.getByTestId('schedule-availability-start-mon-0')).toHaveValue('8:00 AM');

    await save();
    const updated: Schedule = onSave.mock.calls[0][0];
    expect(hasScheduleAvailability(updated, serviceWithHours)).toBe(false);
  });

  test('reset restores the service default hours while staying an override', async () => {
    const { onSave } = setup(
      scheduleWith(availableTime('mon', '09:00:00', '17:00:00')),
      vi.fn(),
      vi.fn(),
      serviceWithHours
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('schedule-availability-reset'));
    });

    expect(screen.getByTestId('schedule-availability-start-mon-0')).toHaveValue('8:00 AM');
    expect(screen.getByTestId('schedule-availability-enable')).toBeChecked();

    await save();
    const updated: Schedule = onSave.mock.calls[0][0];
    expect(hasScheduleAvailability(updated, serviceWithHours)).toBe(true);
    // The same hours as the service default, written out one day at a time.
    expect(resolveAvailability(serviceWithHours, updated)).toEqual([
      { daysOfWeek: ['mon'], availableStartTime: '08:00:00', availableEndTime: '16:00:00' },
      { daysOfWeek: ['tue'], availableStartTime: '08:00:00', availableEndTime: '16:00:00' },
      { daysOfWeek: ['sat'], allDay: true },
    ]);
  });

  // Which of the Schedule, the service, or the actor the zone comes from is the
  // caller's business, resolved by getSchedulingTimezone and covered in Core.
  test('shows the timezone it is given', () => {
    setup(scheduleWith(availableTime('mon', '09:00:00', '17:00:00')), vi.fn(), vi.fn(), service, 'America/Los_Angeles');

    expect(screen.getByTestId('schedule-availability-timezone')).toHaveTextContent(
      'All times are in local America/Los_Angeles time zone.'
    );
  });

  test('omits the timezone note when no timezone is given', () => {
    setup(scheduleWith(availableTime('mon', '09:00:00', '17:00:00')));
    expect(screen.queryByTestId('schedule-availability-timezone')).toBeNull();
  });

  test('refuses to save a custom override with no available days', async () => {
    const { onSave } = setup(scheduleWith(availableTime('mon', '09:00:00', '17:00:00')));

    await act(async () => {
      fireEvent.click(screen.getByTestId('schedule-availability-switch-mon'));
    });

    const saveButton = screen.getByRole('button', { name: 'Save Settings' });
    expect(saveButton).toHaveAttribute('aria-disabled', 'true');
    expect(saveButton).toHaveAttribute('data-disabled');

    await save();
    expect(onSave).not.toHaveBeenCalled();
  });

  test('gives the reason on the Save button rather than in the form', async () => {
    setup(scheduleWith(availableTime('mon', '09:00:00', '17:00:00')));

    // Nothing to explain while the day is available.
    expect(screen.queryByTestId('schedule-availability-empty-week')).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByTestId('schedule-availability-switch-mon'));
    });

    // The reason reaches the pointer through a tooltip on hover, and assistive
    // technology through the button's description, rather than as a message in
    // the body of the form.
    const reason = screen.getByTestId('schedule-availability-empty-week');
    expect(reason).toHaveTextContent(
      'Custom availability must include at least one available day. ' +
        'To stop scheduling Follow-Up Visit on this calendar, turn it off in schedule settings.'
    );
    expect(screen.getByRole('button', { name: 'Save Settings' })).toHaveAttribute(
      'aria-describedby',
      reason.getAttribute('id')
    );

    // The button stays focusable precisely so the reason is reachable without
    // a pointer.
    await act(async () => {
      fireEvent.focus(screen.getByRole('button', { name: 'Save Settings' }));
    });
    expect(await screen.findByRole('tooltip')).toHaveTextContent('must include at least one available day');

    // Making a day available again clears all of it.
    await act(async () => {
      fireEvent.click(screen.getByTestId('schedule-availability-switch-mon'));
    });
    expect(screen.queryByTestId('schedule-availability-empty-week')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save Settings' })).not.toHaveAttribute('aria-disabled');
  });

  describe('editing the service default', () => {
    function setupService(
      svc: WithId<HealthcareService> = serviceWithHours,
      onSave = vi.fn(),
      timezone?: string
    ): { onSave: ReturnType<typeof vi.fn> } {
      render(<ScheduleAvailabilityEditor service={svc} timezone={timezone} onSave={onSave} />);
      return { onSave };
    }

    test('opens on the hours the service itself holds', () => {
      setupService();

      expect(screen.getByTestId('schedule-availability-start-mon-0')).toHaveValue('8:00 AM');
      expect(screen.getByTestId('schedule-availability-end-mon-0')).toHaveValue('4:00 PM');
      expect(screen.getByTestId('schedule-availability-start-sat-0')).toHaveValue('12:00 AM');
      expect(screen.getByTestId('schedule-availability-end-sat-0')).toHaveValue('12:00 AM');
    });

    test('drops the override switch and reset link, which have nothing to refer to', () => {
      setupService();

      expect(screen.queryByTestId('schedule-availability-enable')).toBeNull();
      expect(screen.queryByTestId('schedule-availability-reset')).toBeNull();
      // The days stay editable regardless, since there is no override to switch on first.
      expect(screen.getByTestId('schedule-availability-start-mon-0')).toBeEnabled();
    });

    test('saves the hours onto the service rather than into an extension', async () => {
      const { onSave } = setupService();

      await pickTime('schedule-availability-end-mon-0', '5:00 PM');
      await save();

      expect(onSave).toHaveBeenCalledTimes(1);
      const updated: HealthcareService = onSave.mock.calls[0][0];
      expect(updated.resourceType).toBe('HealthcareService');
      expect(updated.availableTime).toEqual([
        { daysOfWeek: ['mon'], availableStartTime: '08:00:00', availableEndTime: '17:00:00' },
        { daysOfWeek: ['tue'], availableStartTime: '08:00:00', availableEndTime: '16:00:00' },
        { daysOfWeek: ['sat'], allDay: true },
      ]);
      // The Schedule extension path is left alone entirely.
      expect(updated.extension).toBeUndefined();
    });

    test('keeps the rest of the service intact', async () => {
      const { onSave } = setupService({ ...serviceWithHours, comment: 'Front desk only', active: true });

      await save();

      const updated: HealthcareService = onSave.mock.calls[0][0];
      expect(updated.comment).toBe('Front desk only');
      expect(updated.active).toBe(true);
      expect(updated.id).toBe('service-1');
    });

    test('refuses to save a service default with no available days', async () => {
      const { onSave } = setupService();

      for (const day of ['mon', 'tue', 'sat']) {
        await act(async () => {
          fireEvent.click(screen.getByTestId(`schedule-availability-switch-${day}`));
        });
      }

      // Saving a service with no hours would drop `availableTime` entirely,
      // which scheduling reads as available around the clock. The form says
      // Unavailable seven times over, so that save is refused rather than
      // allowed to mean its opposite.
      expect(screen.getByTestId('schedule-availability-empty-week')).toHaveTextContent(
        'Default availability must include at least one available day. Clearing every day would leave ' +
          'Follow-Up Visit bookable around the clock rather than never; to stop scheduling it, deactivate ' +
          'the visit service type.'
      );
      await save();

      expect(onSave).not.toHaveBeenCalled();
    });

    test('saves a service that is available around the clock, which an empty week is not', async () => {
      const { onSave } = setupService();

      // Refusing the empty week only holds up if the state it gets mistaken for
      // is still reachable. It is reached by saying so, a full day at a time.
      // Saturday already runs all day; the rest start closed or on office hours.
      for (const day of ['wed', 'thu', 'fri', 'sun']) {
        await act(async () => {
          fireEvent.click(screen.getByTestId(`schedule-availability-switch-${day}`));
        });
      }
      for (const day of ['mon', 'tue', 'wed', 'thu', 'fri', 'sun']) {
        await pickTime(`schedule-availability-start-${day}-0`, '12:00 AM');
        await pickTime(`schedule-availability-end-${day}-0`, '12:00 AM');
      }
      await save();

      expect(onSave).toHaveBeenCalledTimes(1);
      const updated: HealthcareService = onSave.mock.calls[0][0];
      expect(updated.availableTime).toEqual([
        { daysOfWeek: ['mon'], allDay: true },
        { daysOfWeek: ['tue'], allDay: true },
        { daysOfWeek: ['wed'], allDay: true },
        { daysOfWeek: ['thu'], allDay: true },
        { daysOfWeek: ['fri'], allDay: true },
        { daysOfWeek: ['sat'], allDay: true },
        { daysOfWeek: ['sun'], allDay: true },
      ]);
    });

    test('shows the timezone it is given with no calendar in play', () => {
      setupService(serviceWithHours, vi.fn(), 'America/Chicago');

      expect(screen.getByTestId('schedule-availability-timezone')).toHaveTextContent('America/Chicago');
    });

    test('starts from a blank week when the service has no hours', () => {
      setupService(service);

      expect(screen.getAllByText('Unavailable')).toHaveLength(7);
      // A service with no hours opens on the blank week it already is. There is
      // nothing to save until a day is made available, and saying so on the
      // button is how the editor explains what an empty week would have meant.
      expect(screen.getByRole('button', { name: 'Save Settings' })).toHaveAttribute('aria-disabled', 'true');
    });
  });
});
