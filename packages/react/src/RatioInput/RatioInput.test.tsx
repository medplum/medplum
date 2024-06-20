import { Ratio } from '@medplum/fhirtypes';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { RatioInput } from './RatioInput';

describe('RatioInput', () => {
  test('Renders', () => {
    render(
      <RatioInput
        name="a"
        path=""
        defaultValue={{ numerator: { value: 5, unit: 'mg' }, denominator: { value: 10, unit: 'ml' } }}
      />
    );
    expect(screen.getByDisplayValue('5')).toBeDefined();
    expect(screen.getByDisplayValue('mg')).toBeDefined();
    expect(screen.getByDisplayValue('10')).toBeDefined();
    expect(screen.getByDisplayValue('ml')).toBeDefined();
  });

  test('Renders undefined value', () => {
    render(<RatioInput name="a" path="" />);
    expect(screen.getAllByPlaceholderText('Value').length).toBe(2);
    expect(screen.getAllByPlaceholderText('Unit').length).toBe(2);
  });

  test('Set value', async () => {
    let lastValue: Ratio | undefined = undefined;

    render(<RatioInput name="a" path="" onChange={(value) => (lastValue = value)} />);

    await act(async () => {
      fireEvent.change(screen.getAllByPlaceholderText('Value')[0], {
        target: { value: '5' },
      });
    });

    await act(async () => {
      fireEvent.change(screen.getAllByPlaceholderText('Unit')[0], {
        target: { value: 'mg' },
      });
    });

    await act(async () => {
      fireEvent.change(screen.getAllByPlaceholderText('Value')[1], {
        target: { value: '10' },
      });
    });

    await act(async () => {
      fireEvent.change(screen.getAllByPlaceholderText('Unit')[1], {
        target: { value: 'ml' },
      });
    });

    expect(lastValue).toBeDefined();
    expect(lastValue).toMatchObject({ numerator: { value: 5, unit: 'mg' }, denominator: { value: 10, unit: 'ml' } });
  });
});
