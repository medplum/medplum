import { Identifier } from '@medplum/core';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { act } from 'react-dom/test-utils';
import { IdentifierInput } from './IdentifierInput';

describe('IdentifierInput', () => {

  test('Renders', () => {
    render(<IdentifierInput name="a" defaultValue={{ system: 'x', value: 'y' }} />);
    expect(screen.getByDisplayValue('x')).not.toBeUndefined();
    expect(screen.getByDisplayValue('y')).not.toBeUndefined();
  });

  test('Renders undefined value', () => {
    render(<IdentifierInput name="a" />);
    expect(screen.getByPlaceholderText('System')).not.toBeUndefined();
    expect(screen.getByPlaceholderText('Value')).not.toBeUndefined();
  });

  test('Set value', async () => {
    let lastValue: Identifier | undefined = undefined;

    render(<IdentifierInput name="a" onChange={value => lastValue = value} />);

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('System'), { target: { value: 's' } });
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Value'), { target: { value: 'v' } });
    });

    expect(lastValue).not.toBeUndefined();
    expect(lastValue).toMatchObject({ system: 's', value: 'v' });
  });

});
