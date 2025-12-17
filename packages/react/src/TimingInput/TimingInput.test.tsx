// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Timing } from '@medplum/fhirtypes';
import { act, fireEvent, render, screen } from '../test-utils/render';
import type { TimingInputProps } from './TimingInput';
import { TimingInput } from './TimingInput';

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

    // re-opening the modal should display the selected dayOfWeek
    await act(async () => {
      fireEvent.click(screen.getByText('Edit'));
    });
    const node = await screen.getByLabelText('W');
    expect(node).toHaveProperty('checked', true);
  });

  test('Change repeat.timeOfDay', async () => {
    const onChange = jest.fn();

    render(<TimingInput {...defaultProps} onChange={onChange} />);
    expect(screen.getByText('Edit')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByText('Edit'));
    });

    expect(await screen.findByText('Timing')).toBeDefined();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Repeat every'), { target: { value: '1' } });
      fireEvent.change(screen.getByDisplayValue('day'), { target: { value: 'wk' } });
    });

    // Add 3x Time of Day
    await act(async () => {
      fireEvent.click(screen.getByText('Add Time of Day'));
      fireEvent.click(screen.getByText('Add Time of Day'));
      fireEvent.click(screen.getByText('Add Time of Day'));
    });

    expect(await screen.getByTestId('timing-repeat-timeOfDay-input-0')).toBeDefined();
    expect(await screen.getByTestId('timing-repeat-timeOfDay-input-1')).toBeDefined();
    expect(await screen.getByTestId('timing-repeat-timeOfDay-input-2')).toBeDefined();

    await act(async () => {
      fireEvent.change(screen.getByTestId('timing-repeat-timeOfDay-input-0'), { target: { value: '10:00' } });
      fireEvent.change(screen.getByTestId('timing-repeat-timeOfDay-input-1'), { target: { value: '12:00' } });
      fireEvent.change(screen.getByTestId('timing-repeat-timeOfDay-input-2'), { target: { value: '14:00' } });
    });

    // Remove middle item
    await act(async () => {
      fireEvent.click(screen.getByTestId('timing-repeat-timeOfDay-remove-1'));
    });

    // Close modal and trigger `onChange`
    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(onChange).toHaveBeenCalledWith({
      repeat: { period: 1, periodUnit: 'wk', timeOfDay: ['10:00:00', '14:00:00'] },
    });
  });

  test('Loading a complex timing into the editor', async () => {
    const timing: Timing = {
      repeat: {
        period: 1,
        periodUnit: 'wk',
        dayOfWeek: ['mon', 'wed'],
        timeOfDay: ['08:00:00', '14:30:55'],
      },
    };
    render(<TimingInput {...defaultProps} defaultValue={timing} />);
    expect(screen.getByTestId('timinginput-display')).toHaveTextContent('Weekly on Mon, Wed at 8:00 AM, 2:30:55 PM');
    expect(screen.getByText('Edit')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByText('Edit'));
    });

    expect(await screen.findByText('Timing')).toBeDefined();

    const checkboxes = await screen.getAllByRole('checkbox', { checked: true });
    expect(checkboxes.map((cb) => cb.getAttribute('value'))).toEqual(['mon', 'wed']);

    const timeOfDay = await screen.getAllByTestId(/timing-repeat-timeOfDay-input/);
    expect(timeOfDay.map((i) => i.getAttribute('value'))).toEqual(['08:00', '14:30']);
  });
});
