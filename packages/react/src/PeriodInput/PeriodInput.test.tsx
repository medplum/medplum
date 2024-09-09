import { Period } from '@medplum/fhirtypes';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { PeriodInput } from './PeriodInput';

const startDateTime = '2021-01-01T00:00:00.000Z';
const endDateTime = '2021-01-02T00:00:00.000Z';

describe('PeriodInput', () => {
  test('Renders undefined value', () => {
    render(<PeriodInput path="" name="a" />);
    expect(screen.getByPlaceholderText('Start')).toBeDefined();
    expect(screen.getByPlaceholderText('End')).toBeDefined();
  });

  test('Renders', () => {
    render(<PeriodInput path="" name="a" defaultValue={{ start: startDateTime, end: endDateTime }} />);
    expect(screen.getByPlaceholderText('Start')).toBeDefined();
    expect(screen.getByPlaceholderText('End')).toBeDefined();
  });

  test('Set value', async () => {
    render(<PeriodInput path="" name="a" />);

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Start'), {
        target: { value: startDateTime },
      });
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('End'), {
        target: { value: endDateTime },
      });
    });

    expect(screen.getByDisplayValue(startDateTime)).toBeInTheDocument();
    expect(screen.getByDisplayValue(endDateTime)).toBeInTheDocument();
  });

  test('Change event', async () => {
    let lastValue: Period | undefined = undefined;

    render(<PeriodInput path="" name="a" onChange={(value) => (lastValue = value)} />);

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Start'), {
        target: { value: startDateTime },
      });
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('End'), {
        target: { value: endDateTime },
      });
    });

    expect(lastValue).toBeDefined();
    expect(lastValue).toMatchObject({ start: startDateTime, end: endDateTime });
  });
});
