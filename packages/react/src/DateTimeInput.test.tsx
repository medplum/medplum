import { OperationOutcome } from '@medplum/fhirtypes';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { convertIsoToLocal, convertLocalToIso, DateTimeInput } from './DateTimeInput';

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
    const outcome: OperationOutcome = {
      resourceType: 'OperationOutcome',
      issue: [
        {
          details: {
            text: 'Bad',
          },
          expression: ['test'],
        },
      ],
    };

    render(<DateTimeInput name="test" placeholder="Placeholder" outcome={outcome} />);
    const input = screen.getByPlaceholderText('Placeholder');
    expect(input).toBeDefined();
    expect(input.getAttribute('aria-invalid')).toEqual('true');
  });

  test('onChange without listener', async () => {
    const value = convertIsoToLocal(new Date().toISOString());

    render(<DateTimeInput placeholder="Placeholder" />);

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Placeholder'), { target: { value } });
    });

    expect(screen.getByDisplayValue(value)).toBeDefined();
  });

  test('onChange with listener', async () => {
    const onChange = jest.fn();

    const date = new Date();
    date.setMilliseconds(0); // datetime-local does not support milliseconds

    const isoString = date.toISOString();
    const localString = convertIsoToLocal(isoString);

    render(<DateTimeInput placeholder="Placeholder" onChange={onChange} />);

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Placeholder'), { target: { value: localString } });
    });

    expect(onChange).toBeCalledWith(isoString);
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
