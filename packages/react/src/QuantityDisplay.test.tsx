import { render, screen } from '@testing-library/react';
import React from 'react';
import { QuantityDisplay } from './QuantityDisplay';

describe('QuantityDisplay', () => {
  test('Renders', () => {
    render(<QuantityDisplay value={{ value: 1, unit: 'mg' }} />);
    expect(screen.getByText('1 mg')).toBeInTheDocument();
  });

  test('Renders undefined value', () => {
    render(<QuantityDisplay />);
  });

  test('Renders comparator', () => {
    render(<QuantityDisplay value={{ comparator: '<', value: 1, unit: 'mg' }} />);
    expect(screen.getByText('< 1 mg')).toBeInTheDocument();
  });
});
