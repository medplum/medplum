import { act, fireEvent, render, screen } from '../test-utils/render';
import { TimingInput, TimingInputProps } from './TimingInput';

describe('TimingInput', () => {
  const defaultProps: Pick<TimingInputProps, 'path' | 'name'> = { name: 'example', path: 'Extension.value[x]' };

  test('Renders', async () => {
    render(<TimingInput {...defaultProps} />);
    expect(screen.getByText('No repeat')).toBeDefined();
    expect(screen.getByText('Edit')).toBeDefined();
  });

  test('Open dialog', async () => {
    render(<TimingInput {...defaultProps} />);
    expect(screen.getByText('Edit')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByText('Edit'));
    });

    expect(await screen.findByText('Timing')).toBeDefined();
  });

  test('Cancel', async () => {
    const onChange = jest.fn();

    render(<TimingInput {...defaultProps} onChange={onChange} />);
    expect(screen.getByText('Edit')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByText('Edit'));
    });

    const closeButton = await screen.findByLabelText('Close');
    await act(async () => {
      fireEvent.click(closeButton);
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  test('Add repeat', async () => {
    const onChange = jest.fn();

    render(<TimingInput {...defaultProps} defaultValue={{}} onChange={onChange} />);
    expect(screen.getByText('Edit')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByText('Edit'));
    });

    expect(await screen.findByText('Timing')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Repeat'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(onChange).toHaveBeenCalledWith({ repeat: { period: 1, periodUnit: 'd' } });
  });

  test('Remove repeat', async () => {
    const onChange = jest.fn();

    render(
      <TimingInput {...defaultProps} defaultValue={{ repeat: { period: 1, periodUnit: 'd' } }} onChange={onChange} />
    );
    expect(screen.getByText('Edit')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByText('Edit'));
    });

    expect(await screen.findByText('Timing')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Repeat'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(onChange).toHaveBeenCalledWith({});
  });

  test('Change start', async () => {
    const onChange = jest.fn();

    render(<TimingInput {...defaultProps} onChange={onChange} />);
    expect(screen.getByText('Edit')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByText('Edit'));
    });

    expect(await screen.findByText('Timing')).toBeDefined();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Starts on'), { target: { value: '2022' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(onChange).toHaveBeenCalled();
  });

  test('Change period', async () => {
    const onChange = jest.fn();

    render(<TimingInput {...defaultProps} onChange={onChange} />);
    expect(screen.getByText('Edit')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByText('Edit'));
    });

    expect(await screen.findByText('Timing')).toBeDefined();

    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('1'), { target: { value: '2' } });
    });

    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('day'), { target: { value: 'mo' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(onChange).toHaveBeenCalledWith({ repeat: { period: 2, periodUnit: 'mo' } });
  });

  test('Change day of week', async () => {
    const onChange = jest.fn();

    render(<TimingInput {...defaultProps} onChange={onChange} />);
    expect(screen.getByText('Edit')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByText('Edit'));
    });

    expect(await screen.findByText('Timing')).toBeDefined();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Repeat every'), { target: { value: '1' } });
    });

    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('day'), { target: { value: 'wk' } });
    });

    // Add Monday
    await act(async () => {
      fireEvent.click(screen.getByLabelText('M'));
    });

    // Remove Monday
    await act(async () => {
      fireEvent.click(screen.getByLabelText('M'));
    });

    // Add Wednesday
    await act(async () => {
      fireEvent.click(screen.getByLabelText('W'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(onChange).toHaveBeenCalledWith({ repeat: { period: 1, periodUnit: 'wk', dayOfWeek: ['wed'] } });
  });
});
