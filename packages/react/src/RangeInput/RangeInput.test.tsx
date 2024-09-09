import { Range } from '@medplum/fhirtypes';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { RangeInput } from './RangeInput';

describe('RangeInput', () => {
  test('Renders', () => {
    render(
      <RangeInput path="" name="a" defaultValue={{ low: { value: 5, unit: 'mg' }, high: { value: 10, unit: 'mg' } }} />
    );
    expect(screen.getByDisplayValue('5')).toBeDefined();
    expect(screen.getByDisplayValue('10')).toBeDefined();
    expect(screen.getAllByDisplayValue('mg').length).toBe(2);
  });

  test('Renders undefined value', () => {
    render(<RangeInput path="" name="a" />);
    expect(screen.getAllByPlaceholderText('Value').length).toBe(2);
    expect(screen.getAllByPlaceholderText('Unit').length).toBe(2);
  });

  test('Set value', async () => {
    let lastValue: Range | undefined = undefined;

    render(<RangeInput path="" name="a" onChange={(value) => (lastValue = value)} />);

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
        target: { value: 'mg' },
      });
    });

    expect(lastValue).toBeDefined();
    expect(lastValue).toMatchObject({ low: { value: 5, unit: 'mg' }, high: { value: 10, unit: 'mg' } });
  });
});
