// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { act, fireEvent, render, screen } from '../test-utils/render';
import { CalendarDateInput } from './CalendarDateInput';
import { getMonthString, getStartMonth } from './CalendarDateInput.utils';

describe('CalendarDateInput', () => {
  test('Renders', () => {
    const onClick = jest.fn();
    render(<CalendarDateInput availableDates={[]} onChangeMonth={jest.fn()} onClick={onClick} />);
    expect(screen.getByText(getMonthString(new Date()))).toBeDefined();
    expect(screen.getByText('SUN')).toBeDefined();
    expect(screen.getByText('1')).toBeDefined();
  });

  test('Disabled days', () => {
    const onClick = jest.fn();
    render(<CalendarDateInput availableDates={[]} onChangeMonth={jest.fn()} onClick={onClick} />);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '4' }).disabled).toBe(true);
  });

  test('Change months', async () => {
    const onChangeMonth = jest.fn();
    const onClick = jest.fn();
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

    const onClick = jest.fn();
    render(<CalendarDateInput availableDates={availableDates} onChangeMonth={jest.fn()} onClick={onClick} />);

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
});
