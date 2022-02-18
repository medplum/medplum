import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { CalendarInput, getMonthString } from './CalendarInput';

describe('CalendarInput', () => {
  test('Renders', () => {
    const isAvailable = (): boolean => true;
    const onClick = jest.fn();
    render(<CalendarInput isAvailable={isAvailable} onClick={onClick} />);
    expect(screen.getByText(getMonthString(new Date()))).toBeDefined();
    expect(screen.getByText('SUN')).toBeDefined();
    expect(screen.getByText('1')).toBeDefined();
  });

  test('Disabled days', () => {
    const isAvailable = (date: Date): boolean => date.getDate() !== 4;
    const onClick = jest.fn();
    render(<CalendarInput isAvailable={isAvailable} onClick={onClick} />);
    expect(screen.getByText('4')).toBeDefined();
    expect((screen.queryByText('4') as HTMLButtonElement).disabled).toBe(true);
  });

  test('Change months', async () => {
    const isAvailable = (): boolean => true;
    const onClick = jest.fn();
    render(<CalendarInput isAvailable={isAvailable} onClick={onClick} />);

    const nextMonth = new Date();
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
    const isAvailable = (): boolean => true;
    const onClick = jest.fn();
    render(<CalendarInput isAvailable={isAvailable} onClick={onClick} />);

    await act(async () => {
      fireEvent.click(screen.getByText('15'));
    });

    expect(onClick).toHaveBeenCalled();

    const result = onClick.mock.calls[0][0];
    expect(result.getDate()).toBe(15);
  });
});
