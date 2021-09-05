import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { act } from 'react-dom/test-utils';
import { AddressInput } from './AddressInput';

describe('AddressInput', () => {

  test('Renders', () => {
    render(<AddressInput name="a" defaultValue={{ line: ['123 main st'], city: 'Happy' }} />);
    expect(screen.getByDisplayValue('123 main st')).not.toBeUndefined();
    expect(screen.getByDisplayValue('Happy')).not.toBeUndefined();
  });

  test('Renders undefined value', () => {
    render(<AddressInput name="a" />);
    expect(screen.queryByDisplayValue('123 main st')).toBeNull();
  });

  test('Set value', async () => {
    render(<AddressInput name="a" />);

    await act(async () => {
      fireEvent.change(screen.getByTestId('address-use'), { target: { value: 'home' } });
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId('address-type'), { target: { value: 'both' } });
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Line 1'), { target: { value: '742 Evergreen Terrace' } });
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Line 2'), { target: { value: 'Attn: Homer' } });
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('City'), { target: { value: 'Springfield' } });
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('State'), { target: { value: 'OR' } });
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Postal Code'), { target: { value: '97403' } });
    });

    expect(screen.getByDisplayValue('{"use":"home","type":"both","line":["742 Evergreen Terrace","Attn: Homer"],"city":"Springfield","state":"OR","postalCode":"97403"}')).not.toBeUndefined();
  });

});
