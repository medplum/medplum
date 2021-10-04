import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { ContactPointInput } from './ContactPointInput';

describe('ContactPointInput', () => {

  test('Renders', () => {
    render(
      <ContactPointInput name="test" defaultValue={{ system: 'email', value: 'abc@example.com' }} />
    );

    const system = screen.getByTestId('system') as HTMLInputElement;
    expect(system).not.toBeUndefined();
    expect(system.value).toEqual('email');

    const value = screen.getByPlaceholderText('Value') as HTMLInputElement;
    expect(value).not.toBeUndefined();
    expect(value.value).toEqual('abc@example.com');
  });

  test('Change events', async () => {
    render(
      <ContactPointInput name="test" defaultValue={{}} />
    );

    await act(async () => {
      fireEvent.change(screen.getByTestId('use'), { target: { value: 'home' } });
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId('system'), { target: { value: 'email' } });
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Value'), { target: { value: 'xyz@example.com' } });
    });

    const hidden = screen.getByTestId('hidden') as HTMLInputElement;
    expect(hidden).not.toBeUndefined();
    expect(JSON.parse(hidden.value)).toMatchObject({
      use: 'home',
      system: 'email',
      value: 'xyz@example.com'
    });
  });

  test('Set blanks', async () => {
    render(
      <ContactPointInput name="test" defaultValue={{
        use: 'home',
        system: 'email',
        value: 'abc@example.com'
      }} />
    );

    await act(async () => {
      fireEvent.change(screen.getByTestId('use'), { target: { value: '' } });
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId('system'), { target: { value: '' } });
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Value'), { target: { value: '' } });
    });

    const hidden = screen.getByTestId('hidden') as HTMLInputElement;
    expect(hidden).not.toBeUndefined();
    expect(hidden.value).toEqual('{}');
  });

});
