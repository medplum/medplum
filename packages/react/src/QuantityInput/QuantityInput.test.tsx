import { Quantity } from '@medplum/fhirtypes';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { QuantityInput } from './QuantityInput';

describe('QuantityInput', () => {
  test('Renders', () => {
    render(<QuantityInput path="" name="a" defaultValue={{ value: 123, unit: 'mg' }} />);
    expect(screen.getByDisplayValue('123')).toBeDefined();
    expect(screen.getByDisplayValue('mg')).toBeDefined();
  });

  test('Renders undefined value', () => {
    render(<QuantityInput path="" name="a" />);
    expect(screen.getByPlaceholderText('Value')).toBeDefined();
    expect(screen.getByPlaceholderText('Unit')).toBeDefined();
  });

  test('Set value', async () => {
    let lastValue: Quantity | undefined = undefined;

    render(<QuantityInput path="" name="a" onChange={(value) => (lastValue = value)} />);

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Value'), {
        target: { value: '123' },
      });
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Unit'), {
        target: { value: 'mg' },
      });
    });

    expect(lastValue).toBeDefined();
    expect(lastValue).toMatchObject({ value: 123, unit: 'mg' });
  });

  test('Set value with comparator', async () => {
    let lastValue: Quantity | undefined = undefined;

    render(<QuantityInput path="" name="a" onChange={(value) => (lastValue = value)} />);

    await act(async () => {
      fireEvent.change(screen.getByTestId('a-comparator'), {
        target: { value: '<' },
      });
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Value'), {
        target: { value: '123' },
      });
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Unit'), {
        target: { value: 'mg' },
      });
    });

    expect(lastValue).toBeDefined();
    expect(lastValue).toMatchObject({ comparator: '<', value: 123, unit: 'mg' });
  });

  test('Set value with wheel', async () => {
    render(<QuantityInput path="" name="a" defaultValue={{ value: 2.3, unit: 'ng' }} />);

    const valueInput = screen.getByPlaceholderText('Value');
    fireEvent.wheel(valueInput, {
      deltaY: 100,
    });
    fireEvent.change(valueInput, {
      target: { value: '2.4' },
    });

    expect(valueInput).toHaveValue(2.4);
  });

  test('Disable wheel', async () => {
    render(<QuantityInput path="" name="a" disableWheel defaultValue={{ value: 2.3, unit: 'ng' }} />);

    const valueInput = screen.getByPlaceholderText('Value');

    fireEvent.wheel(valueInput, {
      deltaY: 100,
    });
    expect(valueInput).toHaveValue(2.3);
  });
});
