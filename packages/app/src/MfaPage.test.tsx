// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { notifications, Notifications } from '@mantine/notifications';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router';
import { AppRoutes } from './AppRoutes';
import { act, render, screen, userEvent, UserEvent } from './test-utils/render';

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
    await user.click(screen.getByRole('button', { name: 'Enroll' }));
    expect(screen.getByText('MFA is enabled')).toBeInTheDocument();
  });

  test('Disable -- success', async () => {
    const getSpy = jest.spyOn(medplum, 'get');
    const user = await setup();

    // Enroll into MFA
    await user.click(screen.getByRole('button', { name: 'Enroll' }));

    expect(screen.getByText('MFA is enabled')).toBeInTheDocument();

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

    // Enroll into MFA
    await user.click(screen.getByRole('button', { name: 'Enroll' }));
    expect(screen.getByText('MFA is enabled')).toBeInTheDocument();

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
