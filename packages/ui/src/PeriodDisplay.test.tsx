import { render, screen } from '@testing-library/react';
import React from 'react';
import { PeriodDisplay } from './PeriodDisplay';

describe('PeriodDisplay', () => {
  test('Renders', () => {
    render(<PeriodDisplay value={{ start: '2021-01-01T12:00:00Z', end: '2021-01-02T12:00:00Z' }} />);
    expect(screen.getByText('2021', { exact: false })).toBeInTheDocument();
  });

  test('Renders undefined value', () => {
    render(<PeriodDisplay />);
  });
});
