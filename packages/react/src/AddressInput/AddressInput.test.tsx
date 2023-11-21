import { Address } from '@medplum/fhirtypes';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { AddressInput } from './AddressInput';

describe('AddressInput', () => {
  test('Renders', () => {
    render(<AddressInput name="a" defaultValue={{ line: ['123 main st'], city: 'Happy' }} />);
    expect(screen.getByDisplayValue('123 main st')).toBeDefined();
    expect(screen.getByDisplayValue('Happy')).toBeDefined();
  });

  test('Renders undefined value', () => {
    render(<AddressInput name="a" />);
    expect(screen.queryByDisplayValue('123 main st')).toBeNull();
  });

  test('Set value', async () => {
    let lastValue: Address | undefined = undefined;

    render(<AddressInput name="a" onChange={(value) => (lastValue = value)} />);

    await act(async () => {
      fireEvent.change(screen.getByTestId('address-use'), {
        target: { value: 'home' },
      });
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId('address-type'), {
        target: { value: 'both' },
      });
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Line 1'), {
        target: { value: '742 Evergreen Terrace' },
      });
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Line 2'), {
        target: { value: 'Attn: Homer' },
      });
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('City'), {
        target: { value: 'Springfield' },
      });
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('State'), {
        target: { value: 'OR' },
      });
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Postal Code'), {
        target: { value: '97403' },
      });
    });

    expect(lastValue).toBeDefined();
    expect(lastValue).toMatchObject({
      use: 'home',
      type: 'both',
      line: ['742 Evergreen Terrace', 'Attn: Homer'],
      city: 'Springfield',
      state: 'OR',
      postalCode: '97403',
    });
  });
});
