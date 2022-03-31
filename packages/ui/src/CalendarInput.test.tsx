import { Slot } from '@medplum/fhirtypes';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { CalendarInput, getMonthString, getStartMonth } from './CalendarInput';

describe('CalendarInput', () => {
  test('Renders', () => {
    const onClick = jest.fn();
    render(<CalendarInput slots={[]} onClick={onClick} />);
    expect(screen.getByText(getMonthString(new Date()))).toBeDefined();
    expect(screen.getByText('SUN')).toBeDefined();
    expect(screen.getByText('1')).toBeDefined();
  });

  test('Disabled days', () => {
    const onClick = jest.fn();
    render(<CalendarInput slots={[]} onClick={onClick} />);
    expect(screen.getByText('4')).toBeDefined();
    expect((screen.queryByText('4') as HTMLButtonElement).disabled).toBe(true);
  });

  test('Change months', async () => {
    const onClick = jest.fn();
    render(<CalendarInput slots={[]} onClick={onClick} />);

    const nextMonth = getStartMonth();
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    // Move forward one month
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Next month'));
    });
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

    const slots: Slot[] = [
      {
        resourceType: 'Slot',
        start: startTime.toISOString(),
      },
    ];

    const onClick = jest.fn();
    render(<CalendarInput slots={slots} onClick={onClick} />);

    // Move forward one month
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Next month'));
    });
    expect(screen.getByText(getMonthString(nextMonth))).toBeDefined();

    // Expect the 15th to be available
    const dayButton = screen.getByText('15');
    expect((dayButton as HTMLButtonElement).disabled).toBe(false);

    await act(async () => {
      fireEvent.click(dayButton);
    });

    expect(onClick).toHaveBeenCalled();

    const result = onClick.mock.calls[0][0];
    expect(result.getDate()).toBe(15);
  });
});
