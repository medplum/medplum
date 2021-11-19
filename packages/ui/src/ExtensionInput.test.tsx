import { Identifier } from '@medplum/core';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { act } from 'react-dom/test-utils';
import { ExtensionInput } from './ExtensionInput';

describe('ExtensionInput', () => {

  test('Renders', () => {
    render(<ExtensionInput name="a" defaultValue={{ url: 'https://example.com' }} />);
    expect(screen.getByTestId('extension-input')).not.toBeUndefined();
  });

  test('Renders undefined value', () => {
    render(<ExtensionInput name="a" />);
    expect(screen.getByTestId('extension-input')).not.toBeUndefined();
  });

  test('Set value', async () => {
    let lastValue: Identifier | undefined = undefined;

    render(<ExtensionInput name="a" onChange={value => lastValue = value} />);

    await act(async () => {
      fireEvent.change(screen.getByTestId('extension-input'), { target: { value: '{"url":"https://foo.com"}' } });
    });

    expect(lastValue).not.toBeUndefined();
    expect(lastValue).toMatchObject({ url: 'https://foo.com' });
  });

});
