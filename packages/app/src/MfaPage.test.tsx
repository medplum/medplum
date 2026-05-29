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
    const getSpy = jest.spyOn(medplum, 'get');
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
    const getSpy = jest.spyOn(medplum, 'get');
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
});
