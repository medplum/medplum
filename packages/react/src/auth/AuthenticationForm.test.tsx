// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { AuthenticationForm } from './AuthenticationForm';

describe('AuthenticationForm', () => {
  test('Renders the email screen first', () => {
    render(
      <MedplumProvider medplum={new MockClient()}>
        <AuthenticationForm handleAuthResponse={() => {}} />
      </MedplumProvider>
    );
    expect(screen.getByTestId('auth.email')).toBeInTheDocument();
  });

  test('Entering an email address advances you to the password screen', async () => {
    const emailAddress = 'me@example.com';
    render(
      <MedplumProvider medplum={new MockClient()}>
        <AuthenticationForm handleAuthResponse={() => {}} />
      </MedplumProvider>
    );

    const input = screen.getByTestId('auth.email');
    await act(async () => fireEvent.change(input, { target: { value: emailAddress } }));

    const button = screen.getByRole('button', { name: 'Continue' });
    await act(async () => fireEvent.click(button));

    expect(screen.getByTestId('auth.password')).toBeInTheDocument();

    // Ensure that we display the entered email address
    expect(screen.getByText(emailAddress)).toBeInTheDocument();
  });

  test('You can navigate from the password screen back to the email screen', async () => {
    const emailAddress = 'me@example.com';
    render(
      <MedplumProvider medplum={new MockClient()}>
        <AuthenticationForm handleAuthResponse={() => {}} />
      </MedplumProvider>
    );

    // enter the email address
    const input = screen.getByTestId('auth.email');
    await act(async () => fireEvent.change(input, { target: { value: emailAddress } }));

    // advance the screen
    const button = screen.getByRole('button', { name: 'Continue' });
    await act(async () => fireEvent.click(button));

    expect(screen.getByTestId('auth.password')).toBeInTheDocument();

    const returnButton = screen.getByRole('button', { name: 'Change' });
    expect(returnButton).toBeInTheDocument();

    await act(async () => fireEvent.click(returnButton));

    expect(screen.getByTestId('auth.email')).toBeInTheDocument();
  });
});
