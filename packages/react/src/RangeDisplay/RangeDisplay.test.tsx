import { render, screen } from '../test-utils/render';
import { RangeDisplay } from './RangeDisplay';

describe('RangeDisplay', () => {
  test('Renders', () => {
    render(<RangeDisplay value={{ low: { value: 5, unit: 'mg' }, high: { value: 10, unit: 'mg' } }} />);
    expect(screen.getByText('5 - 10 mg')).toBeInTheDocument();
  });

  test('Renders low only', () => {
    render(<RangeDisplay value={{ low: { value: 5, unit: 'mg' } }} />);
    expect(screen.getByText('>= 5 mg')).toBeInTheDocument();
  });

  test('Renders high only', () => {
    render(<RangeDisplay value={{ high: { value: 10, unit: 'mg' } }} />);
    expect(screen.getByText('<= 10 mg')).toBeInTheDocument();
  });

  test('Renders undefined value', () => {
    render(<RangeDisplay />);
  });

  test('Renders empty range', () => {
    render(<RangeDisplay value={{}} />);
  });
});
