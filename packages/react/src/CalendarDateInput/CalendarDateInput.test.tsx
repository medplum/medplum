// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
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

  test('Leaves days unpressed when nothing is selected', () => {
    const available = getStartMonth();
    available.setDate(10);

    render(<CalendarDateInput availableDates={[available]} onChangeMonth={vi.fn()} onClick={vi.fn()} />);

    expect(screen.getByRole('button', { name: '10' })).not.toHaveAttribute('aria-pressed');
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
