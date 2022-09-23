import { Period } from '@medplum/fhirtypes';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { PeriodInput } from './PeriodInput';

const startDateTime = '2021-01-01T12:00:00Z';
const endDateTime = '2021-01-02T12:00:00Z';

describe('PeriodInput', () => {
  beforeAll(() => {
    window.ResizeObserver =
      window.ResizeObserver ||
      jest.fn().mockImplementation(() => ({
        disconnect: jest.fn(),
        observe: jest.fn(),
        unobserve: jest.fn(),
      }));
  });

  test('Renders undefined value', () => {
    render(<PeriodInput name="a" placeholder="Test" />);
    expect(screen.getByPlaceholderText('Test')).toBeDefined();
  });

  test('Renders', () => {
    render(<PeriodInput name="a" placeholder="Test" defaultValue={{ start: startDateTime, end: endDateTime }} />);
    expect(screen.getByPlaceholderText('Test')).toBeDefined();
    expect((screen.getByPlaceholderText('Test') as HTMLInputElement).value).toBe('January 1, 2021 – January 2, 2021');
  });

  test('Set value', async () => {
    render(<PeriodInput name="a" placeholder="Test" />);

    await act(async () => {
      fireEvent.click(screen.getByPlaceholderText('Test'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('11'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('12'));
    });

    expect((screen.getByPlaceholderText('Test') as HTMLInputElement).value).toBeDefined();
  });

  test('Change event', async () => {
    let lastValue: Period | undefined = undefined;

    render(<PeriodInput name="a" placeholder="Test" onChange={(value) => (lastValue = value)} />);

    await act(async () => {
      fireEvent.click(screen.getByPlaceholderText('Test'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('11'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('12'));
    });

    expect(lastValue).toBeDefined();
  });
});
