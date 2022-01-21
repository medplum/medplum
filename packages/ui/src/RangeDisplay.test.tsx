import { render, screen } from '@testing-library/react';
import React from 'react';
import { RangeDisplay } from './RangeDisplay';

describe('RangeDisplay', () => {
  test('Renders', () => {
    render(<RangeDisplay value={{ low: { value: 5, unit: 'mg' }, high: { value: 10, unit: 'mg' } }} />);
    expect(screen.getByText('5 mg')).toBeInTheDocument();
    expect(screen.getByText('10 mg')).toBeInTheDocument();
  });

  test('Renders undefined value', () => {
    render(<RangeDisplay />);
  });
});
