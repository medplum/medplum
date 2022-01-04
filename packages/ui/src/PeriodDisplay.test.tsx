import { render, screen } from '@testing-library/react';
import React from 'react';
import { PeriodDisplay } from './PeriodDisplay';

describe('PeriodDisplay', () => {
  test('Handles undefined value', () => {
    render(<PeriodDisplay />);
  });

  test('Ignores empty value', () => {
    render(<PeriodDisplay value={{}} />);
  });

  test('Renders both start and end', () => {
    render(<PeriodDisplay value={{ start: '2021-06-01T12:00:00Z', end: '2022-06-02T12:00:00Z' }} />);
    expect(screen.getByText('2021', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('2022', { exact: false })).toBeInTheDocument();
  });

  test('Renders only start', () => {
    render(<PeriodDisplay value={{ start: '2021-01-01T12:00:00Z' }} />);
    expect(screen.getByText('2021', { exact: false })).toBeInTheDocument();
  });

  test('Renders only end', () => {
    render(<PeriodDisplay value={{ end: '2022-06-02T12:00:00Z' }} />);
    expect(screen.getByText('2022', { exact: false })).toBeInTheDocument();
  });
});
