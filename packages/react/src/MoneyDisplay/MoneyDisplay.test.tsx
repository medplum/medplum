import { render, screen } from '../test-utils/render';
import { MoneyDisplay } from './MoneyDisplay';

describe('MoneyDisplay', () => {
  test('Undefined value', () => {
    render(
      <span>
        test
        <MoneyDisplay />
      </span>
    );
    expect(screen.getByText('test')).toBeInTheDocument();
  });

  test('Empty value', () => {
    render(
      <span>
        test
        <MoneyDisplay value={{}} />
      </span>
    );
    expect(screen.getByText('test')).toBeInTheDocument();
  });

  test('Default currency', () => {
    render(<MoneyDisplay value={{ value: 10.1 }} />);
    expect(screen.getByText('$10.10')).toBeInTheDocument();
  });

  test('USD', () => {
    render(<MoneyDisplay value={{ value: 10.1, currency: 'USD' }} />);
    expect(screen.getByText('$10.10')).toBeInTheDocument();
  });

  test('EUR', () => {
    render(<MoneyDisplay value={{ value: 10.1, currency: 'EUR' }} />);
    expect(screen.getByText('€10.10')).toBeInTheDocument();
  });
});
