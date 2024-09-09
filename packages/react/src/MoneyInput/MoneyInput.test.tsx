import { Money } from '@medplum/fhirtypes';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { MoneyInput } from './MoneyInput';

describe('MoneyInput', () => {
  test('Renders', () => {
    render(<MoneyInput path="" name="a" defaultValue={{ value: 123, currency: 'USD' }} />);
    expect(screen.getByDisplayValue('123')).toBeDefined();
    expect(screen.getByDisplayValue('USD')).toBeDefined();
  });

  test('Renders undefined value', () => {
    render(<MoneyInput path="" name="a" />);
    expect(screen.getByPlaceholderText('Value')).toBeDefined();
    expect(screen.getByDisplayValue('USD')).toBeDefined();
  });

  test('Set value', async () => {
    let lastValue: Money | undefined = undefined;

    render(<MoneyInput path="" name="a" onChange={(value) => (lastValue = value)} />);

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Value'), {
        target: { value: '123' },
      });
    });

    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('USD'), {
        target: { value: 'EUR' },
      });
    });

    expect(lastValue).toBeDefined();
    expect(lastValue).toMatchObject({ value: 123, currency: 'EUR' });
  });
});
