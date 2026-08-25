// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';
import { useState } from 'react';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { CalendarDateInput } from './CalendarDateInput';
import { getMonthString, getStartMonth } from './CalendarDateInput.utils';

describe('CalendarDateInput', () => {
  test('Renders', () => {
    const onClick = vi.fn();
    render(<CalendarDateInput availableDates={[]} onChangeMonth={vi.fn()} onClick={onClick} />);
    expect(screen.getByText(getMonthString(new Date()))).toBeDefined();
    expect(screen.getByText('SUN')).toBeDefined();
    expect(screen.getByText('1')).toBeDefined();
  });

  test('Disabled days', () => {
    const onClick = vi.fn();
    render(<CalendarDateInput availableDates={[]} onChangeMonth={vi.fn()} onClick={onClick} />);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '4' }).disabled).toBe(true);
  });

  test('Change months', async () => {
    const onChangeMonth = vi.fn();
    const onClick = vi.fn();
    render(<CalendarDateInput availableDates={[]} onChangeMonth={onChangeMonth} onClick={onClick} />);

    const nextMonth = getStartMonth();
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    // Move forward one month
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Next month'));
    });
    expect(onChangeMonth).toHaveBeenCalledWith(nextMonth);
    expect(screen.getByText(getMonthString(nextMonth))).toBeDefined();

    // Go back to the original month
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Previous month'));
    });
    expect(screen.getByText(getMonthString(new Date()))).toBeDefined();
  });

  test('Click day', async () => {
    const nextMonth = getStartMonth();
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    // Add a slot on the 15th of next month
    const startTime = new Date(nextMonth.getTime());
    startTime.setDate(15);
    startTime.setHours(12, 0, 0, 0);

    const availableDates = [startTime];

    const onClick = vi.fn();
    render(<CalendarDateInput availableDates={availableDates} onChangeMonth={vi.fn()} onClick={onClick} />);

    // Move forward one month
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Next month'));
    });
    expect(screen.getByText(getMonthString(nextMonth))).toBeDefined();

    // Expect the 15th to be available
    const dayButton = screen.getByRole('button', { name: '15' });
    expect((dayButton as HTMLButtonElement).disabled).toBe(false);

    await act(async () => {
      fireEvent.click(dayButton);
    });

    expect(onClick).toHaveBeenCalled();

    const result = onClick.mock.calls[0][0];
    expect(result.getFullYear()).toBe(nextMonth.getFullYear());
    expect(result.getMonth()).toBe(nextMonth.getMonth());
    expect(result.getDate()).toBe(15);
  });

  test('Controlled month ignores internal navigation', async () => {
    const month = getStartMonth();
    const onChangeMonth = vi.fn();
    render(<CalendarDateInput availableDates={[]} month={month} onChangeMonth={onChangeMonth} onClick={vi.fn()} />);

    const nextMonth = new Date(month);
    nextMonth.setMonth(month.getMonth() + 1);

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Next month'));
    });

    // The caller is told which month was asked for, but the display stays put
    // until the caller passes the new month back in.
    expect(onChangeMonth).toHaveBeenCalledWith(nextMonth);
    expect(screen.getByText(getMonthString(month))).toBeDefined();
  });

  test('Marks the selected day', () => {
    const selected = getStartMonth();
    selected.setDate(10);

    const available = new Date(selected);
    available.setHours(9, 0, 0, 0);

    render(
      <CalendarDateInput availableDates={[available]} selected={selected} onChangeMonth={vi.fn()} onClick={vi.fn()} />
    );

    expect(screen.getByRole('button', { name: '10' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('Marks the days that have times on them', () => {
    const month = getStartMonth();

    render(
      <CalendarDateInput
        availableDates={[dayOf(month, 10), dayOf(month, 12)]}
        month={month}
        allowUnavailableDates
        onChangeMonth={vi.fn()}
        onClick={vi.fn()}
      />
    );

    // Which days are worth clicking is what the month view is read for.
    expect(screen.getByRole('button', { name: '10' }).className).toContain('available');
    expect(screen.getByRole('button', { name: '12' }).className).toContain('available');
    expect(screen.getByRole('button', { name: '11' }).className).not.toContain('available');
  });

  test('Bands a range across the days it covers, marking both ends as chosen', () => {
    const month = getStartMonth();

    render(
      <CalendarDateInput
        availableDates={[dayOf(month, 10)]}
        month={month}
        range={{ start: dayOf(month, 10), end: dayOf(month, 12) }}
        allowUnavailableDates
        onChangeMonth={vi.fn()}
        onClick={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: '10' }).className).toContain('selected');
    expect(screen.getByRole('button', { name: '12' }).className).toContain('selected');
    // The days between the ends are in the range without having been picked.
    expect(screen.getByRole('button', { name: '11' }).className).not.toContain('selected');
    expect(cellOf('11').className).toContain('inRange');
    expect(cellOf('13').className).not.toContain('inRange');
    // A day with times keeps saying so inside the band.
    expect(screen.getByRole('button', { name: '10' }).className).toContain('available');
  });

  test('Bands a range whose ends carry a time of day', () => {
    const month = getStartMonth();
    const start = dayOf(month, 10);
    start.setHours(9, 30);
    const end = dayOf(month, 12);
    end.setHours(17, 0);

    render(
      <CalendarDateInput
        availableDates={[]}
        month={month}
        range={{ start, end }}
        allowUnavailableDates
        onChangeMonth={vi.fn()}
        onClick={vi.fn()}
      />
    );

    // A caller handing over the ends of a booking gives instants, not days. The
    // 10th would otherwise be drawn as an end of a band it did not belong to.
    expect(cellOf('10').className).toContain('inRange');
    expect(cellOf('11').className).toContain('inRange');
    expect(cellOf('12').className).toContain('inRange');
    expect(cellOf('13').className).not.toContain('inRange');
    expect(screen.getByRole('button', { name: '11' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('Rounds the band off where the range ends', () => {
    // A month whose weekdays are known, so that the mid-range day is not also the
    // end of its week: July 2026 opens on a Wednesday, putting the 13th to the
    // 15th from Monday to Wednesday.
    const month = new Date(2026, 6, 1);

    render(
      <CalendarDateInput
        availableDates={[]}
        month={month}
        range={{ start: dayOf(month, 13), end: dayOf(month, 15) }}
        allowUnavailableDates
        onChangeMonth={vi.fn()}
        onClick={vi.fn()}
      />
    );

    expect(cellOf('13').className).toContain('rangeOpens');
    expect(cellOf('15').className).toContain('rangeCloses');
    expect(cellOf('14').className).not.toContain('rangeOpens');
    expect(cellOf('14').className).not.toContain('rangeCloses');
  });

  test('Squares the band off where a range carries on into the next week', () => {
    const month = new Date(2026, 6, 1);

    render(
      <CalendarDateInput
        availableDates={[]}
        month={month}
        range={{ start: dayOf(month, 16), end: dayOf(month, 21) }}
        allowUnavailableDates
        onChangeMonth={vi.fn()}
        onClick={vi.fn()}
      />
    );

    // The 18th is a Saturday and the 19th the Sunday after it, so the band has to
    // close at the end of one row and open again at the start of the next.
    expect(cellOf('18').className).toContain('rangeCloses');
    expect(cellOf('19').className).toContain('rangeOpens');
    expect(cellOf('18').className).not.toContain('rangeOpens');
    expect(cellOf('19').className).not.toContain('rangeCloses');
  });

  test('Days before the earliest cannot be picked, even where empty days can', async () => {
    const month = new Date(2026, 6, 1);
    render(
      <CalendarDateInput
        availableDates={[]}
        month={month}
        earliestDate={new Date(2026, 6, 15, 9, 30)}
        allowUnavailableDates
        onChangeMonth={vi.fn()}
        onClick={vi.fn()}
      />
    );

    // A day gone by is a different kind of empty from a day with nothing booked:
    // there is no time on it left to ask for.
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '14' }).disabled).toBe(true);
    // The earliest day itself still has the rest of itself to offer.
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '15' }).disabled).toBe(false);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '16' }).disabled).toBe(false);
  });

  test('Will not page back past the month the earliest day falls in', async () => {
    const onChangeMonth = vi.fn();
    const month = new Date(2026, 6, 1);
    render(
      <CalendarDateInput
        availableDates={[]}
        month={month}
        earliestDate={new Date(2026, 6, 15)}
        allowUnavailableDates
        onChangeMonth={onChangeMonth}
        onClick={vi.fn()}
      />
    );

    // June holds nothing bookable, so there is nothing to go back for.
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Previous month' }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Next month' }).disabled).toBe(false);
  });

  test('Pages back freely once past the earliest month', async () => {
    const month = new Date(2026, 8, 1);
    render(
      <CalendarDateInput
        availableDates={[]}
        month={month}
        earliestDate={new Date(2026, 6, 15)}
        allowUnavailableDates
        onChangeMonth={vi.fn()}
        onClick={vi.fn()}
      />
    );

    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Previous month' }).disabled).toBe(false);
  });

  test('Days with nothing on offer can be clicked when the caller allows it', async () => {
    const onClick = vi.fn();
    render(<CalendarDateInput availableDates={[]} allowUnavailableDates onChangeMonth={vi.fn()} onClick={onClick} />);

    const day = screen.getByRole<HTMLButtonElement>('button', { name: '4' });
    expect(day.disabled).toBe(false);
    // Left unmarked, so it does not read as a day with times.
    expect(day.className).not.toContain('available');

    await act(async () => {
      fireEvent.click(day);
    });

    expect(onClick.mock.calls[0][0].getDate()).toBe(4);
  });

  test('Dragging across days asks for the range they cover', async () => {
    const onSelectRange = vi.fn();
    const onClick = vi.fn();
    const month = getStartMonth();
    render(
      <CalendarDateInput
        availableDates={[]}
        month={month}
        allowUnavailableDates
        onChangeMonth={vi.fn()}
        onClick={onClick}
        onSelectRange={onSelectRange}
      />
    );

    await drag(10, 11, 12);

    // Drawn as the range it would ask for, so that what is being dragged out
    // looks like what letting go will leave behind.
    expect(cellOf('11').className).toContain('inRange');
    expect(screen.getByRole('button', { name: '12' }).className).toContain('selected');

    await release();

    expect(onSelectRange).toHaveBeenCalledWith(dayOf(month, 10), dayOf(month, 12));
    expect(onClick).not.toHaveBeenCalled();
  });

  test('Dragging backwards asks for the same range', async () => {
    const onSelectRange = vi.fn();
    const month = getStartMonth();
    render(
      <CalendarDateInput
        availableDates={[]}
        month={month}
        allowUnavailableDates
        onChangeMonth={vi.fn()}
        onClick={vi.fn()}
        onSelectRange={onSelectRange}
      />
    );

    await drag(12, 10);
    await release();

    // Someone working back from a deadline drags the other way round.
    expect(onSelectRange).toHaveBeenCalledWith(dayOf(month, 10), dayOf(month, 12));
  });

  test('A press and release on one day is a click, not a range', async () => {
    const onSelectRange = vi.fn();
    const onClick = vi.fn();
    const month = getStartMonth();
    render(
      <CalendarDateInput
        availableDates={[]}
        month={month}
        allowUnavailableDates
        onChangeMonth={vi.fn()}
        onClick={onClick}
        onSelectRange={onSelectRange}
      />
    );

    await drag(10);
    await release();
    await click(10);

    expect(onSelectRange).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledWith(dayOf(month, 10));
  });

  test('The click that ends a drag is not also a day being picked', async () => {
    const onSelectRange = vi.fn();
    const onClick = vi.fn();
    const month = getStartMonth();
    render(
      <CalendarDateInput
        availableDates={[]}
        month={month}
        allowUnavailableDates
        onChangeMonth={vi.fn()}
        onClick={onClick}
        onSelectRange={onSelectRange}
      />
    );

    await drag(10, 12);
    await release();
    // A release reported as a click on the day it landed on would otherwise throw
    // the range away and ask for that one day instead.
    await click(12);

    expect(onSelectRange).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  test('A day picked after a drag is still picked', async () => {
    const onSelectRange = vi.fn();
    const onClick = vi.fn();
    const month = getStartMonth();
    render(
      <CalendarDateInput
        availableDates={[]}
        month={month}
        allowUnavailableDates
        onChangeMonth={vi.fn()}
        onClick={onClick}
        onSelectRange={onSelectRange}
      />
    );

    await drag(10, 12);
    await release();

    // A drag across days is released as a click on the row or table the two ends
    // share rather than on either day, so nothing swallowed it on the way past.
    // The next day pressed must not be swallowed in its place.
    await pressDay(20);

    expect(onSelectRange).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith(dayOf(month, 20));
  });

  test('Shift-clicking a second day asks for the range up to it', async () => {
    const onSelectRange = vi.fn();
    const onClick = vi.fn();
    const month = getStartMonth();
    render(
      <CalendarDateInput
        availableDates={[]}
        month={month}
        selected={dayOf(month, 10)}
        allowUnavailableDates
        onChangeMonth={vi.fn()}
        onClick={onClick}
        onSelectRange={onSelectRange}
      />
    );

    // Dragging needs a pointer that hovers, so shift is what leaves a range within
    // reach of a touchscreen or a keyboard. With no gesture of its own to go on,
    // the range is measured from the day the calendar was handed.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '12' }), { shiftKey: true });
    });

    expect(onSelectRange).toHaveBeenCalledWith(dayOf(month, 10), dayOf(month, 12));
    expect(onClick).not.toHaveBeenCalled();
  });

  test('A range handed in with no gesture is measured from its start', async () => {
    const onSelectRange = vi.fn();
    const month = getStartMonth();
    render(
      <CalendarDateInput
        availableDates={[]}
        month={month}
        range={{ start: dayOf(month, 10), end: dayOf(month, 12) }}
        allowUnavailableDates
        onChangeMonth={vi.fn()}
        onClick={vi.fn()}
        onSelectRange={onSelectRange}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '8' }), { shiftKey: true });
    });

    // Nothing here says which end the user anchored on, so the start is the only
    // end there is to measure from. A range the calendar produced itself is
    // measured from the day that gesture anchored on instead.
    expect(onSelectRange).toHaveBeenCalledWith(dayOf(month, 8), dayOf(month, 10));
  });

  test('Shift-clicking with no day picked yet is just a click', async () => {
    const onSelectRange = vi.fn();
    const onClick = vi.fn();
    const month = getStartMonth();
    render(
      <CalendarDateInput
        availableDates={[]}
        month={month}
        allowUnavailableDates
        onChangeMonth={vi.fn()}
        onClick={onClick}
        onSelectRange={onSelectRange}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '12' }), { shiftKey: true });
    });

    // There is no other end for the range to run to.
    expect(onSelectRange).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledWith(dayOf(month, 12));
  });

  test('Shift-clicking again measures from the same day, so a range can be taken back', async () => {
    const onSelectRange = vi.fn();
    const month = getStartMonth();
    render(<HeldRangeCalendar month={month} onSelectRange={onSelectRange} />);

    await pressDay(10);
    await shiftPressDay(20);

    expect(onSelectRange).toHaveBeenLastCalledWith(dayOf(month, 10), dayOf(month, 20));

    await shiftPressDay(5);

    // The far end moves; the day picked stays put.
    expect(onSelectRange).toHaveBeenLastCalledWith(dayOf(month, 5), dayOf(month, 10));

    await shiftPressDay(20);

    // So shift-clicking back where it started puts the range back.
    expect(onSelectRange).toHaveBeenLastCalledWith(dayOf(month, 10), dayOf(month, 20));
  });

  test('A shift-click after a backwards drag measures from where the drag began', async () => {
    const onSelectRange = vi.fn();
    const month = getStartMonth();
    render(<HeldRangeCalendar month={month} onSelectRange={onSelectRange} />);

    await drag(20, 15, 10);
    await release();

    expect(onSelectRange).toHaveBeenLastCalledWith(dayOf(month, 10), dayOf(month, 20));

    await shiftPressDay(25);

    // Not from the 10th: the range grew out of the 20th, so that is the end it
    // is still measured from.
    expect(onSelectRange).toHaveBeenLastCalledWith(dayOf(month, 20), dayOf(month, 25));
  });

  test('A day picked with the keyboard is the day a shift-click measures from', async () => {
    const onSelectRange = vi.fn();
    const month = getStartMonth();
    render(<HeldRangeCalendar month={month} onSelectRange={onSelectRange} />);

    // No press at all, which is the route a keyboard takes.
    await click(10);
    await shiftPressDay(12);

    expect(onSelectRange).toHaveBeenCalledWith(dayOf(month, 10), dayOf(month, 12));
  });

  test('A day the caller did not keep is not measured from', async () => {
    const onSelectRange = vi.fn();
    const onClick = vi.fn();
    const month = getStartMonth();
    render(
      <CalendarDateInput
        availableDates={[]}
        month={month}
        allowUnavailableDates
        onChangeMonth={vi.fn()}
        onClick={onClick}
        onSelectRange={onSelectRange}
      />
    );

    await pressDay(10);
    await shiftPressDay(12);

    // Nothing is on show to have anchored on, so there is no range to ask for.
    expect(onSelectRange).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenLastCalledWith(dayOf(month, 12));
  });

  test('A range the caller replaces is measured from its own start', async () => {
    const onSelectRange = vi.fn();
    const month = getStartMonth();
    const { rerender } = render(
      <CalendarDateInput
        availableDates={[]}
        month={month}
        allowUnavailableDates
        onChangeMonth={vi.fn()}
        onClick={vi.fn()}
        onSelectRange={onSelectRange}
      />
    );

    await pressDay(10);

    rerender(
      <CalendarDateInput
        availableDates={[]}
        month={month}
        range={{ start: dayOf(month, 20), end: dayOf(month, 22) }}
        allowUnavailableDates
        onChangeMonth={vi.fn()}
        onClick={vi.fn()}
        onSelectRange={onSelectRange}
      />
    );
    await shiftPressDay(25);

    // The caller has replaced what the click anchored on, so that day is spent.
    expect(onSelectRange).toHaveBeenCalledWith(dayOf(month, 20), dayOf(month, 25));
  });

  test('Shift-clicking carries a range into the next month', async () => {
    const onSelectRange = vi.fn();
    const month = getStartMonth();
    const nextMonth = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    render(<HeldRangeCalendar onSelectRange={onSelectRange} />);

    await pressDay(20);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    });
    await shiftPressDay(3);

    // Paging needs the pointer let go of, so a drag cannot cross a month. Shift
    // is the only way to ask for a range that spans two of them.
    expect(onSelectRange).toHaveBeenCalledWith(dayOf(month, 20), dayOf(nextMonth, 3));
  });

  test('A drag the browser takes over leaves the day to measure from where it was', async () => {
    const onSelectRange = vi.fn();
    const month = getStartMonth();
    render(<HeldRangeCalendar month={month} onSelectRange={onSelectRange} />);

    await pressDay(10);
    await drag(20, 22);
    await act(async () => {
      fireEvent.pointerCancel(window);
    });
    await shiftPressDay(15);

    // A drag that asked for nothing anchored on nothing either.
    expect(onSelectRange).toHaveBeenCalledWith(dayOf(month, 10), dayOf(month, 15));
  });

  test('A drag begun by a finger takes the pointer back off the day it landed on', async () => {
    const month = getStartMonth();
    render(
      <CalendarDateInput
        availableDates={[]}
        month={month}
        allowUnavailableDates
        onChangeMonth={vi.fn()}
        onClick={vi.fn()}
        onSelectRange={vi.fn()}
      />
    );

    const day = screen.getByRole('button', { name: '10' });
    const releasePointerCapture = vi.fn();
    Object.assign(day, { hasPointerCapture: () => true, releasePointerCapture });

    await act(async () => {
      fireEvent.pointerDown(day, { pointerId: 7 });
    });

    // A touchscreen captures the pointer to this day on its own. Kept, the
    // capture would leave a finger dragging across the month stuck here.
    expect(releasePointerCapture).toHaveBeenCalledWith(7);
  });

  test('A drag the browser takes over asks for nothing', async () => {
    const onSelectRange = vi.fn();
    const month = getStartMonth();
    render(
      <CalendarDateInput
        availableDates={[]}
        month={month}
        allowUnavailableDates
        onChangeMonth={vi.fn()}
        onClick={vi.fn()}
        onSelectRange={onSelectRange}
      />
    );

    await drag(10, 12);
    await act(async () => {
      fireEvent.pointerCancel(window);
    });

    // A scroll or a second finger cancels the gesture, which is not the same as
    // letting go on the 12th.
    expect(onSelectRange).not.toHaveBeenCalled();
    expect(cellOf('11').className).not.toContain('inRange');
  });

  test('Ignores dragging when the caller takes no ranges', async () => {
    const onClick = vi.fn();
    const month = getStartMonth();
    render(
      <CalendarDateInput
        availableDates={[]}
        month={month}
        allowUnavailableDates
        onChangeMonth={vi.fn()}
        onClick={onClick}
      />
    );

    await drag(10, 12);
    expect(cellOf('11').className).not.toContain('inRange');
    await release();
    await click(12);

    // Nothing is marked on the way, and the release is just a click.
    expect(onClick).toHaveBeenCalledWith(dayOf(month, 12));
  });

  test('Leaves days unpressed when nothing is selected', () => {
    const available = getStartMonth();
    available.setDate(10);

    render(<CalendarDateInput availableDates={[available]} onChangeMonth={vi.fn()} onClick={vi.fn()} />);

    expect(screen.getByRole('button', { name: '10' })).not.toHaveAttribute('aria-pressed');
  });

  test('Reports every day of a range as chosen', async () => {
    const month = new Date(2026, 0, 1);
    render(
      <CalendarDateInput
        availableDates={[]}
        month={month}
        range={{ start: dayOf(month, 10), end: dayOf(month, 12) }}
        allowUnavailableDates
        onChangeMonth={vi.fn()}
        onClick={vi.fn()}
        onSelectRange={vi.fn()}
      />
    );

    // Three days asked for are three days chosen. Reading the middle one back as
    // unpressed would say the range has a hole in it.
    for (const date of ['10', '11', '12']) {
      expect(screen.getByRole('button', { name: date })).toHaveAttribute('aria-pressed', 'true');
    }
    expect(screen.getByRole('button', { name: '13' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('Pages a month at a time from a month named by its last day', async () => {
    const onChangeMonth = vi.fn();
    // January has 31 days and February does not, so counting a month on from the
    // 31st lands on a day February does not have.
    render(
      <CalendarDateInput
        availableDates={[]}
        month={new Date(2026, 0, 31)}
        onChangeMonth={onChangeMonth}
        onClick={vi.fn()}
      />
    );

    expect(screen.getByText('January 2026')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    });

    // February, not the March a rolled-over 31st would have reached.
    expect(onChangeMonth).toHaveBeenCalledWith(new Date(2026, 1, 1));
  });

  test('Stops paging back at the month the earliest day falls in', async () => {
    const onChangeMonth = vi.fn();
    const { rerender } = render(
      <CalendarDateInput
        availableDates={[]}
        month={new Date(2026, 0, 20)}
        earliestDate={new Date(2026, 0, 15)}
        onChangeMonth={onChangeMonth}
        onClick={vi.fn()}
      />
    );

    // Measured by month, so a day later in the same month is not a month further
    // on: January is the earliest month and there is nothing to page back to.
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled();

    rerender(
      <CalendarDateInput
        availableDates={[]}
        month={new Date(2026, 1, 1)}
        earliestDate={new Date(2026, 0, 15)}
        onChangeMonth={onChangeMonth}
        onClick={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Previous month' })).toBeEnabled();
  });
});

/**
 * A day of the shown month, as the calendar reports it.
 * @param month - The month on screen.
 * @param date - The day of that month.
 * @returns Local midnight of that day.
 */
function dayOf(month: Date, date: number): Date {
  return new Date(month.getFullYear(), month.getMonth(), date);
}

/**
 * Returns the cell a day sits in, which is what carries the range band.
 * @param date - The day of the shown month.
 * @returns The day's table cell.
 */
function cellOf(date: string): HTMLElement {
  const cell = screen.getByRole('button', { name: date }).closest('td');
  if (!cell) {
    throw new Error(`Day ${date} is not in a cell`);
  }
  return cell;
}

/**
 * Presses the first day and travels over the rest.
 *
 * One gesture per act, because the days the drag has reached are read back out of
 * state on the next render, and a whole drag inside one act would leave every
 * step looking at where the pointer was when it started.
 *
 * @param dates - The days of the shown month the pointer passes over, in order.
 */
async function drag(...dates: number[]): Promise<void> {
  for (const [index, date] of dates.entries()) {
    const day = screen.getByRole('button', { name: String(date) });
    await act(async () => {
      if (index === 0) {
        fireEvent.pointerDown(day);
      }
      fireEvent.pointerOver(day);
    });
  }
}

/**
 * Lets go, wherever the pointer has ended up.
 */
async function release(): Promise<void> {
  await act(async () => {
    fireEvent.pointerUp(window);
  });
}

/**
 * Clicks a day of the shown month.
 * @param date - The day to click.
 */
async function click(date: number): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: String(date) }));
  });
}

/**
 * Picks a day the way a mouse does: press, release, then the click that follows.
 *
 * The press matters, because it is what tells the calendar a fresh gesture has
 * begun. `click` on its own is the keyboard's route in.
 *
 * @param date - The day to pick.
 */
async function pressDay(date: number): Promise<void> {
  await drag(date);
  await release();
  await click(date);
}

/**
 * Shift-clicks a day the way a mouse does: press, release, then the click.
 *
 * The press is what a shift-click has to survive, since it is the same press
 * that begins a drag.
 *
 * @param date - The day to shift-click.
 */
async function shiftPressDay(date: number): Promise<void> {
  await act(async () => {
    fireEvent.pointerDown(screen.getByRole('button', { name: String(date) }), { shiftKey: true });
  });
  await release();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: String(date) }), { shiftKey: true });
  });
}

interface HeldRangeCalendarProps {
  readonly month?: Date;
  readonly onClick?: (date: Date) => void;
  readonly onSelectRange?: (start: Date, end: Date) => void;
}

/**
 * A calendar whose caller keeps what it asks for, as a working one does.
 *
 * The day a shift-click measures from is only trusted while it is still on show,
 * so what was asked for has to be handed back in for the next shift-click to
 * build on it.
 *
 * @param props - The month to show, and spies on what is asked for.
 * @returns The calendar, holding the day or the range it has been asked for.
 */
function HeldRangeCalendar(props: HeldRangeCalendarProps): JSX.Element {
  const [selected, setSelected] = useState<Date>();
  const [range, setRange] = useState<{ start: Date; end: Date }>();
  return (
    <CalendarDateInput
      availableDates={[]}
      month={props.month}
      selected={selected}
      range={range}
      allowUnavailableDates
      onChangeMonth={vi.fn()}
      onClick={(date) => {
        setRange(undefined);
        setSelected(date);
        props.onClick?.(date);
      }}
      onSelectRange={(start, end) => {
        setSelected(undefined);
        setRange({ start, end });
        props.onSelectRange?.(start, end);
      }}
    />
  );
}
