import { render, screen } from '@testing-library/react';
import { RatioDisplay } from './RatioDisplay';

describe('RatioDisplay', () => {
  test('Renders', () => {
    render(<RatioDisplay value={{ numerator: { value: 5, unit: 'mg' }, denominator: { value: 10, unit: 'ml' } }} />);
    expect(screen.getByText('5 mg / 10 ml')).toBeInTheDocument();
  });

  test('Renders undefined value', () => {
    render(<RatioDisplay />);
  });
});
