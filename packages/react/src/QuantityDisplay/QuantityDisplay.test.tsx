import { render, screen } from '../test-utils/render';
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

  test('Missing value', () => {
    render(<QuantityDisplay value={{ unit: 'mg' }} />);
    expect(screen.getByText('mg')).toBeInTheDocument();
  });

  test('Missing unit', () => {
    render(<QuantityDisplay value={{ value: 123 }} />);
    expect(screen.getByText('123')).toBeInTheDocument();
  });

  test('Percent spacing', () => {
    render(<QuantityDisplay value={{ value: 50, unit: '%' }} />);
    expect(screen.getByText('50%')).toBeInTheDocument();
  });
});
