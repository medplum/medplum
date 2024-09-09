import { stringify } from '@medplum/core';
import { ContactDetail } from '@medplum/fhirtypes';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { ContactDetailInput } from './ContactDetailInput';

describe('ContactDetailInput', () => {
  test('Renders', () => {
    render(
      <ContactDetailInput
        name="test"
        path="test"
        onChange={jest.fn()}
        outcome={undefined}
        defaultValue={{ name: 'Foo', telecom: [{ system: 'email', value: 'abc@example.com' }] }}
      />
    );

    const system = screen.getByTestId('system') as HTMLInputElement;
    expect(system).toBeDefined();
    expect(system.value).toEqual('email');

    const value = screen.getByPlaceholderText('Value') as HTMLInputElement;
    expect(value).toBeDefined();
    expect(value.value).toEqual('abc@example.com');
  });

  test('Change events', async () => {
    let lastValue: ContactDetail | undefined = undefined;

    render(
      <ContactDetailInput
        name="test"
        path="test"
        outcome={undefined}
        defaultValue={{}}
        onChange={(value) => (lastValue = value)}
      />
    );

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Foo' } });
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId('use'), { target: { value: 'home' } });
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId('system'), { target: { value: 'email' } });
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Value'), { target: { value: 'xyz@example.com' } });
    });

    expect(lastValue).toBeDefined();
    expect(lastValue).toMatchObject({
      name: 'Foo',
      telecom: [
        {
          use: 'home',
          system: 'email',
          value: 'xyz@example.com',
        },
      ],
    });
  });

  test('Set blanks', async () => {
    let lastValue: ContactDetail | undefined = undefined;

    render(
      <ContactDetailInput
        name="test"
        path="test"
        outcome={undefined}
        defaultValue={{
          name: 'Foo',
          telecom: [
            {
              use: 'home',
              system: 'email',
              value: 'abc@example.com',
            },
          ],
        }}
        onChange={(value) => (lastValue = value)}
      />
    );

    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('Foo'), { target: { value: '' } });
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId('use'), { target: { value: '' } });
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId('system'), { target: { value: '' } });
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Value'), {
        target: { value: '' },
      });
    });

    expect(lastValue).toBeDefined();
    expect(stringify(lastValue)).toBeUndefined();
  });
});
