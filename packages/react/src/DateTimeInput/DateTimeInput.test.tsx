// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { badRequest } from '@medplum/core';
import type { OperationOutcome } from '@medplum/fhirtypes';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { DateTimeInput } from './DateTimeInput';
import { convertIsoToLocal, convertLocalToIso } from './DateTimeInput.utils';

describe('DateTimeInput', () => {
  test('Renders', () => {
    expect(render(<DateTimeInput name="test" />)).toBeDefined();
  });

  test('Renders default value', () => {
    const isoString = new Date().toISOString();
    const localString = convertIsoToLocal(isoString);
    render(<DateTimeInput name="test" defaultValue={isoString} />);
    expect(screen.getByDisplayValue(localString)).toBeDefined();
  });

  test('Renders aria invalid', () => {
    const outcome: OperationOutcome = badRequest('Bad', 'test');
    render(<DateTimeInput name="test" placeholder="Placeholder" outcome={outcome} />);
    const input = screen.getByPlaceholderText('Placeholder');
    expect(input).toBeDefined();
    expect(input.getAttribute('aria-invalid')).toEqual('true');
  });

  test('onChange without listener', async () => {
    const value = convertIsoToLocal(new Date().toISOString());

    render(<DateTimeInput name="a" placeholder="Placeholder" />);

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Placeholder'), { target: { value } });
    });

    expect(screen.getByDisplayValue(value)).toBeDefined();
  });

  test('Marks the input empty until it has a value', async () => {
    const value = convertIsoToLocal(new Date().toISOString());

    render(<DateTimeInput name="a" placeholder="Placeholder" />);
    const input = screen.getByPlaceholderText('Placeholder');
    expect(input).toHaveAttribute('data-empty');

    await act(async () => {
      fireEvent.change(input, { target: { value } });
    });
    expect(input).not.toHaveAttribute('data-empty');

    await act(async () => {
      fireEvent.change(input, { target: { value: '' } });
    });
    expect(input).toHaveAttribute('data-empty');
  });

  test('Partially filled input is not marked empty on blur', async () => {
    render(<DateTimeInput name="a" placeholder="Placeholder" />);
    const input = screen.getByPlaceholderText('Placeholder');

    Object.defineProperty(input, 'validity', { value: { badInput: true }, configurable: true });
    await act(async () => {
      fireEvent.blur(input);
    });
    expect(input).not.toHaveAttribute('data-empty');

    Object.defineProperty(input, 'validity', { value: { badInput: false }, configurable: true });
    await act(async () => {
      fireEvent.blur(input);
    });
    expect(input).toHaveAttribute('data-empty');
  });

  test('Default value is not marked empty', () => {
    render(<DateTimeInput name="a" placeholder="Placeholder" defaultValue={new Date().toISOString()} />);
    expect(screen.getByPlaceholderText('Placeholder')).not.toHaveAttribute('data-empty');
  });

  test('Calendar button opens the native picker', async () => {
    render(<DateTimeInput name="a" placeholder="Placeholder" />);
    const input = screen.getByPlaceholderText('Placeholder');
    const showPicker = vi.fn();
    Object.defineProperty(input, 'showPicker', { value: showPicker, configurable: true });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open date picker' }));
    });
    expect(showPicker).toHaveBeenCalled();
  });

  test('Ignores showPicker errors', async () => {
    render(<DateTimeInput name="a" placeholder="Placeholder" />);
    const input = screen.getByPlaceholderText('Placeholder');
    Object.defineProperty(input, 'showPicker', {
      value: () => {
        throw new Error('Not allowed');
      },
      configurable: true,
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open date picker' }));
    });
    expect(input).toBeInTheDocument();
  });

  test('Default value that arrives after mount is not marked empty', async () => {
    const { rerender } = render(<DateTimeInput name="a" placeholder="Placeholder" />);
    expect(screen.getByPlaceholderText('Placeholder')).toHaveAttribute('data-empty');

    await act(async () => {
      rerender(<DateTimeInput name="a" placeholder="Placeholder" defaultValue={new Date().toISOString()} />);
    });
    expect(screen.getByPlaceholderText('Placeholder')).not.toHaveAttribute('data-empty');
  });

  test('onChange with listener', async () => {
    const onChange = vi.fn();

    const date = new Date();
    date.setMilliseconds(0); // datetime-local does not support milliseconds

    const isoString = date.toISOString();
    const localString = convertIsoToLocal(isoString);

    render(<DateTimeInput name="a" placeholder="Placeholder" onChange={onChange} />);

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Placeholder'), { target: { value: localString } });
    });

    expect(onChange).toHaveBeenCalledWith(isoString);
  });

  test('Invalid date/time strings', () => {
    expect(convertIsoToLocal(undefined)).toEqual('');
    expect(convertIsoToLocal(null as unknown as string)).toEqual('');
    expect(convertIsoToLocal('')).toEqual('');
    expect(convertIsoToLocal('asdf')).toEqual('');

    expect(convertLocalToIso(undefined)).toEqual('');
    expect(convertLocalToIso(null as unknown as string)).toEqual('');
    expect(convertLocalToIso('')).toEqual('');
    expect(convertLocalToIso('asdf')).toEqual('');
  });
});
