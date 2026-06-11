// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { notifications, Notifications } from '@mantine/notifications';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router';
import { AppRoutes } from './AppRoutes';
import type { UserEvent } from './test-utils/render';
import { act, render, screen, userEvent } from './test-utils/render';

const medplum = new MockClient();

async function setup(): Promise<UserEvent> {
  const user = userEvent.setup();
  await act(async () => {
    render(
      <MemoryRouter initialEntries={['/mfa']} initialIndex={0}>
        <MantineProvider>
          <MedplumProvider medplum={medplum}>
            <AppRoutes />
            <Notifications />
          </MedplumProvider>
        </MantineProvider>
      </MemoryRouter>
    );
  });

  return user;
}

describe('MfaPage', () => {
  beforeEach(() => {
    notifications.clean();
  });

  test('Renders', async () => {
    await setup();
    expect(screen.getByText('Multi Factor Auth Setup')).toBeInTheDocument();
  });

  test('Enroll', async () => {
    const user = await setup();
    await user.type(screen.getByLabelText('MFA code', { exact: false }), '123456');
    await user.click(screen.getByRole('button', { name: 'Enroll' }));
    expect(screen.getByText('Multi-factor authentication')).toBeInTheDocument();
  });

  test('Add another method when one is available', async () => {
    // Simulate a user already enrolled in email MFA, with TOTP allowed but not yet enrolled.
    const getSpy = jest.spyOn(medplum, 'get').mockResolvedValue({
      enrolled: true,
      enrolledMethods: ['email'],
      allowedMethods: ['totp', 'email'],
      enrollUri: 'otpauth://totp/medplum.com:alice.smith%40example',
      enrollQrCode: 'data:image/png;base64,abc',
    });
    const postSpy = jest.spyOn(medplum, 'post');
    const user = await setup();

    // Already-enrolled view shows the existing method and an option to add TOTP
    expect(screen.getByText('Multi-factor authentication')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add email-based MFA' })).not.toBeInTheDocument();

    // Reveal the authenticator enrollment form
    await user.click(screen.getByRole('button', { name: 'Add an authenticator app' }));

    // Enter a code and enroll
    await user.type(await screen.findByLabelText('MFA code', { exact: false }), '123456');
    await user.click(screen.getByRole('button', { name: 'Enroll' }));

    expect(postSpy).toHaveBeenCalledWith('auth/mfa/enroll', { method: 'totp', token: '123456' });
    await expect(screen.findByText('Authenticator app')).resolves.toBeInTheDocument();

    getSpy.mockRestore();
    postSpy.mockRestore();
  });

  test('Remove a single factor', async () => {
    // Simulate a user enrolled in both methods so per-factor removal is offered.
    const getSpy = jest.spyOn(medplum, 'get').mockResolvedValue({
      enrolled: true,
      enrolledMethods: ['totp', 'email'],
      allowedMethods: ['totp', 'email'],
      enrollUri: 'otpauth://totp/medplum.com:alice.smith%40example',
      enrollQrCode: 'data:image/png;base64,abc',
    });
    const postSpy = jest.spyOn(medplum, 'post');
    const user = await setup();

    expect(screen.getByText('Multi-factor authentication')).toBeInTheDocument();

    // Each enrolled factor has a Remove link
    const removeLinks = screen.getAllByText('Remove');
    expect(removeLinks).toHaveLength(2);

    // Remove the email factor (first method row order: totp, email)
    await user.click(removeLinks[1]);

    // A modal prompts for the authenticator code
    await expect(screen.findByLabelText(/mfa code*/i)).resolves.toBeInTheDocument();
    await user.type(screen.getByLabelText(/mfa code*/i), '123456');
    await user.click(screen.getByRole('button', { name: 'Submit code' }));

    expect(postSpy).toHaveBeenCalledWith('auth/mfa/disable', { method: 'email', token: '123456' });
    await expect(screen.findByText('Email removed')).resolves.toBeInTheDocument();

    getSpy.mockRestore();
    postSpy.mockRestore();
  });

  test('Disable -- success', async () => {
    const getSpy = vi.spyOn(medplum, 'get');
    const user = await setup();

    // Enter a code in the "token" field
    await user.type(screen.getByLabelText('MFA code', { exact: false }), '123456');

    // Enroll into MFA
    await user.click(screen.getByRole('button', { name: 'Enroll' }));

    expect(screen.getByText('Multi-factor authentication')).toBeInTheDocument();

    // Clean notifications
    await act(async () => {
      notifications.clean();
    });

    // Open disable MFA modal
    await user.click(screen.getByRole('button', { name: 'Disable MFA' }));

    // Wait for MFA code input to appear
    await expect(screen.findByLabelText(/mfa code*/i)).resolves.toBeInTheDocument();

    // Enter in a token value
    await user.type(screen.getByLabelText(/mfa code*/i), '1234567890');

    // Submit disable request
    await user.click(screen.getByRole('button', { name: 'Submit code' }));

    // Check that the toast confirms that MFA was disabled
    await expect(screen.findByText('MFA disabled')).resolves.toBeInTheDocument();
    expect(screen.getByText('Enroll')).toBeInTheDocument();
    // Make sure that we called status to refresh MFA QR code
    expect(getSpy).toHaveBeenCalledWith('auth/mfa/status', expect.objectContaining({ cache: 'no-cache' }));
    getSpy.mockRestore();
  });

  test('Disable -- failed', async () => {
    const getSpy = vi.spyOn(medplum, 'get');
    const user = await setup();

    // Enter a code in the "token" field
    await user.type(screen.getByLabelText('MFA code', { exact: false }), '123456');

    // Enroll into MFA
    await user.click(screen.getByRole('button', { name: 'Enroll' }));
    expect(screen.getByText('Multi-factor authentication')).toBeInTheDocument();

    // Clean notifications
    await act(async () => {
      notifications.clean();
    });

    // Open disable MFA modal
    await user.click(screen.getByRole('button', { name: 'Disable MFA' }));

    // Wait for MFA code input to appear
    await expect(screen.findByLabelText(/mfa code*/i)).resolves.toBeInTheDocument();

    // Enter in an INVALID_TOKEN value
    await user.type(screen.getByLabelText(/mfa code*/i), 'INVALID_TOKEN');

    // Reset the mock before submitting code
    getSpy.mockReset();

    // Attempt to submit code without entering
    await user.click(screen.getByRole('button', { name: 'Submit code' }));

    // Make sure invalid token came back
    await expect(screen.findByText('Invalid token')).resolves.toBeInTheDocument();
    await expect(screen.findByText('Enroll')).rejects.toThrow();
    expect(getSpy).not.toHaveBeenCalledWith('auth/mfa/status', expect.objectContaining({ cache: 'no-cache' }));
    getSpy.mockRestore();
  });

  test('Enroll with email-based MFA (email-only project)', async () => {
    // Email is the only allowed method, so the form leads straight to the
    // "enable email-based MFA" prompt.
    const getSpy = jest.spyOn(medplum, 'get').mockResolvedValue({
      enrolled: false,
      enrolledMethods: [],
      allowedMethods: ['email'],
    });
    const postSpy = jest.spyOn(medplum, 'post');
    const user = await setup();

    expect(await screen.findByText('Set up email-based MFA')).toBeInTheDocument();
    // No authenticator/QR step is offered for an email-only project
    expect(screen.queryByLabelText('MFA code', { exact: false })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Enable email-based MFA' }));

    expect(postSpy).toHaveBeenCalledWith('auth/mfa/enroll', { method: 'email' });
    await expect(screen.findByText('Email-based MFA enabled')).resolves.toBeInTheDocument();
    // After enrolling we land on the enrolled view with Email listed
    expect(screen.getByText('Multi-factor authentication')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();

    getSpy.mockRestore();
    postSpy.mockRestore();
  });

  test('Choose email from the method chooser', async () => {
    // Both methods are allowed and the user is not yet enrolled, so a chooser
    // is presented first.
    const getSpy = jest.spyOn(medplum, 'get').mockResolvedValue({
      enrolled: false,
      enrolledMethods: [],
      allowedMethods: ['totp', 'email'],
      enrollUri: 'otpauth://totp/medplum.com:alice.smith%40example',
      enrollQrCode: 'data:image/png;base64,abc',
    });
    const postSpy = jest.spyOn(medplum, 'post');
    const user = await setup();

    expect(await screen.findByText('Set up multi-factor authentication')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Continue with email-based MFA' }));

    expect(postSpy).toHaveBeenCalledWith('auth/mfa/enroll', { method: 'email' });
    await expect(screen.findByText('Email-based MFA enabled')).resolves.toBeInTheDocument();
    expect(screen.getByText('Multi-factor authentication')).toBeInTheDocument();

    getSpy.mockRestore();
    postSpy.mockRestore();
  });

  test('Choose authenticator from the method chooser', async () => {
    // Both methods allowed: selecting the authenticator reveals the TOTP/QR step.
    const getSpy = jest.spyOn(medplum, 'get').mockResolvedValue({
      enrolled: false,
      enrolledMethods: [],
      allowedMethods: ['totp', 'email'],
      enrollUri: 'otpauth://totp/medplum.com:alice.smith%40example',
      enrollQrCode: 'data:image/png;base64,abc',
    });
    const postSpy = jest.spyOn(medplum, 'post');
    const user = await setup();

    expect(await screen.findByText('Set up multi-factor authentication')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Use an authenticator app (recommended)' }));

    // The TOTP enrollment step appears
    expect(await screen.findByText('Multi Factor Auth Setup')).toBeInTheDocument();
    await user.type(await screen.findByLabelText('MFA code', { exact: false }), '123456');
    await user.click(screen.getByRole('button', { name: 'Enroll' }));

    expect(postSpy).toHaveBeenCalledWith('auth/mfa/enroll', { method: 'totp', token: '123456' });
    await expect(screen.findByText('Authenticator app enabled')).resolves.toBeInTheDocument();

    getSpy.mockRestore();
    postSpy.mockRestore();
  });

  test('Add email-based MFA when only authenticator is enrolled', async () => {
    // TOTP enrolled, email allowed but not yet enrolled.
    const getSpy = jest.spyOn(medplum, 'get').mockResolvedValue({
      enrolled: true,
      enrolledMethods: ['totp'],
      allowedMethods: ['totp', 'email'],
      enrollUri: 'otpauth://totp/medplum.com:alice.smith%40example',
      enrollQrCode: 'data:image/png;base64,abc',
    });
    const postSpy = jest.spyOn(medplum, 'post');
    const user = await setup();

    expect(screen.getByText('Multi-factor authentication')).toBeInTheDocument();
    // Adding email is a single click (the server emails codes on later sign-ins)
    expect(screen.queryByRole('button', { name: 'Add an authenticator app' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add email-based MFA' }));

    expect(postSpy).toHaveBeenCalledWith('auth/mfa/enroll', { method: 'email' });
    await expect(screen.findByText('Email-based MFA enabled')).resolves.toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();

    getSpy.mockRestore();
    postSpy.mockRestore();
  });

  test('Disable email-only MFA sends an email challenge', async () => {
    // Email is the only enrolled factor, so opening the disable dialog emails a
    // verification code and the form starts in email-code-entry mode.
    const getSpy = jest.spyOn(medplum, 'get').mockResolvedValue({
      enrolled: true,
      enrolledMethods: ['email'],
      allowedMethods: ['email'],
      email: 'alice.smith@example.com',
    });
    const postSpy = jest.spyOn(medplum, 'post');
    const user = await setup();

    expect(screen.getByText('Multi-factor authentication')).toBeInTheDocument();
    // Only one factor enrolled, so there is no per-factor "Remove" link
    expect(screen.queryByText('Remove')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Disable MFA' }));

    // An email challenge is sent as the dialog opens
    expect(postSpy).toHaveBeenCalledWith('auth/mfa/send-email-challenge', {});
    // The form goes straight to entering the emailed code
    expect(await screen.findByText('Enter verification code')).toBeInTheDocument();
    expect(screen.getByText('alice.smith@example.com')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/mfa code*/i), '123456');
    await user.click(screen.getByRole('button', { name: 'Submit code' }));

    expect(postSpy).toHaveBeenCalledWith('auth/mfa/disable', { token: '123456' });
    await expect(screen.findByText('MFA disabled')).resolves.toBeInTheDocument();

    getSpy.mockRestore();
    postSpy.mockRestore();
  });

  test('Get a code by email instead during disable', async () => {
    // Both factors enrolled: the disable dialog leads with the authenticator
    // code but offers to email a code instead.
    const getSpy = jest.spyOn(medplum, 'get').mockResolvedValue({
      enrolled: true,
      enrolledMethods: ['totp', 'email'],
      allowedMethods: ['totp', 'email'],
      email: 'alice.smith@example.com',
      enrollUri: 'otpauth://totp/medplum.com:alice.smith%40example',
      enrollQrCode: 'data:image/png;base64,abc',
    });
    const postSpy = jest.spyOn(medplum, 'post');
    const user = await setup();

    await user.click(screen.getByRole('button', { name: 'Disable MFA' }));

    // Starts in authenticator mode; no challenge sent yet
    expect(await screen.findByText('Enter MFA code')).toBeInTheDocument();
    expect(postSpy).not.toHaveBeenCalledWith('auth/mfa/send-email-challenge', {});

    await user.click(screen.getByRole('button', { name: 'Get a code by email instead' }));

    expect(postSpy).toHaveBeenCalledWith('auth/mfa/send-email-challenge', {});
    expect(await screen.findByText('Enter verification code')).toBeInTheDocument();

    getSpy.mockRestore();
    postSpy.mockRestore();
  });

  test('Status fetch failure shows a notification', async () => {
    const getSpy = jest.spyOn(medplum, 'get').mockRejectedValue(new Error('Network error'));
    await setup();

    // The page stays blank (enrolled is undefined) and surfaces the error
    await expect(screen.findByText('Network error')).resolves.toBeInTheDocument();
    expect(screen.queryByText('Multi-factor authentication')).not.toBeInTheDocument();

    getSpy.mockRestore();
  });

  test('Authenticator enrollment failure shows a notification', async () => {
    // Default mock: TOTP-only, not enrolled.
    const postSpy = jest.spyOn(medplum, 'post').mockRejectedValue(new Error('Invalid authenticator code'));
    const user = await setup();

    await user.type(await screen.findByLabelText('MFA code', { exact: false }), '123456');
    await user.click(screen.getByRole('button', { name: 'Enroll' }));

    await expect(screen.findByText('Invalid authenticator code')).resolves.toBeInTheDocument();
    // Enrollment failed, so we have not advanced to the enrolled view
    expect(screen.queryByText('Multi-factor authentication')).not.toBeInTheDocument();

    postSpy.mockRestore();
  });

  test('Email challenge failure on disable shows a notification', async () => {
    // Email-only user: opening disable tries to email a code, which fails here.
    const getSpy = jest.spyOn(medplum, 'get').mockResolvedValue({
      enrolled: true,
      enrolledMethods: ['email'],
      allowedMethods: ['email'],
      email: 'alice.smith@example.com',
    });
    const postSpy = jest.spyOn(medplum, 'post').mockRejectedValue(new Error('Unable to send verification email'));
    const user = await setup();

    await user.click(screen.getByRole('button', { name: 'Disable MFA' }));

    expect(postSpy).toHaveBeenCalledWith('auth/mfa/send-email-challenge', {});
    await expect(screen.findByText('Unable to send verification email')).resolves.toBeInTheDocument();

    getSpy.mockRestore();
    postSpy.mockRestore();
  });

  test('Email enrollment failure shows a notification', async () => {
    const getSpy = jest.spyOn(medplum, 'get').mockResolvedValue({
      enrolled: false,
      enrolledMethods: [],
      allowedMethods: ['email'],
    });
    const postSpy = jest.spyOn(medplum, 'post').mockRejectedValue(new Error('Email service unavailable'));
    const user = await setup();

    await user.click(await screen.findByRole('button', { name: 'Enable email-based MFA' }));

    await expect(screen.findByText('Email service unavailable')).resolves.toBeInTheDocument();
    // Still on the enrollment screen since the request failed
    expect(screen.getByText('Set up email-based MFA')).toBeInTheDocument();

    getSpy.mockRestore();
    postSpy.mockRestore();
  });
});
