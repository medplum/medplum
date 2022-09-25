import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { TimingInput } from './TimingInput';

describe('TimingInput', () => {
  test('Renders', async () => {
    render(<TimingInput name="example" />);
    expect(screen.getByText('No repeat')).toBeDefined();
    expect(screen.getByText('Edit')).toBeDefined();
  });

  test('Open dialog', async () => {
    render(<TimingInput name="example" />);
    expect(screen.getByText('Edit')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByText('Edit'));
    });

    expect(screen.getByText('Timing')).toBeDefined();
  });

  test('Cancel', async () => {
    const onChange = jest.fn();

    render(<TimingInput name="example" onChange={onChange} />);
    expect(screen.getByText('Edit')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByText('Edit'));
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Close'));
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  test('Change start', async () => {
    const onChange = jest.fn();

    render(<TimingInput name="example" onChange={onChange} />);
    expect(screen.getByText('Edit')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByText('Edit'));
    });

    expect(screen.getByText('Timing')).toBeDefined();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Starts on'), { target: { value: '2022' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(onChange).toHaveBeenCalled();
  });

  test('Change period', async () => {
    const onChange = jest.fn();

    render(<TimingInput name="example" onChange={onChange} />);
    expect(screen.getByText('Edit')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByText('Edit'));
    });

    expect(screen.getByText('Timing')).toBeDefined();

    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('day'), { target: { value: 'month' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(onChange).toHaveBeenCalled();
  });

  test('Change day of week', async () => {
    const onChange = jest.fn();

    render(<TimingInput name="example" onChange={onChange} />);
    expect(screen.getByText('Edit')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByText('Edit'));
    });

    expect(screen.getByText('Timing')).toBeDefined();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Repeat every'), { target: { value: '1' } });
    });

    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('day'), { target: { value: 'wk' } });
    });

    // Add Monday
    await act(async () => {
      fireEvent.click(screen.getByLabelText('M'));
    });

    // Remove Monday
    await act(async () => {
      fireEvent.click(screen.getByLabelText('M'));
    });

    // Add Wednesday
    await act(async () => {
      fireEvent.click(screen.getByLabelText('W'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(onChange).toHaveBeenCalledWith({ repeat: { period: 1, periodUnit: 'wk', dayOfWeek: ['wed'] } });
  });
});
