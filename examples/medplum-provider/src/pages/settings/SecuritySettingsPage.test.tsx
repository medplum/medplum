// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { screen, userEvent, waitFor } from '../../test-utils/render';
import { SecuritySettingsPage } from './SecuritySettingsPage';
import { renderSettingsPage } from './settingsTestUtils';

describe('SecuritySettingsPage', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
  });

  test('lists sessions and revokes one', async () => {
    const user = userEvent.setup();
    const post = vi.spyOn(medplum, 'post');
    await renderSettingsPage(medplum, <SecuritySettingsPage />);

    expect(await screen.findByText('Chrome on Linux')).toBeInTheDocument();
    expect(screen.getByText('Chrome on Android')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Revoke' })[0]);
    await waitFor(() => expect(post).toHaveBeenCalledWith('auth/revoke', { loginId: '123' }));
    expect(await screen.findByText('Session revoked')).toBeInTheDocument();
  });

  test('changes the password in a modal', async () => {
    const user = userEvent.setup();
    const post = vi.spyOn(medplum, 'post').mockResolvedValue({});
    await renderSettingsPage(medplum, <SecuritySettingsPage />);

    await user.click(screen.getByRole('button', { name: 'Change password' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Current password/), 'old');
    await user.type(within(dialog).getByLabelText(/^New password/), 'new-password');
    await user.type(within(dialog).getByLabelText(/Confirm new password/), 'new-password');
    await user.click(within(dialog).getByRole('button', { name: 'Change password' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('auth/changepassword', {
        oldPassword: 'old',
        newPassword: 'new-password',
        confirmPassword: 'new-password',
      })
    );
    expect(await screen.findByText('Password changed')).toBeInTheDocument();
  });

  test('shows password errors in the form', async () => {
    const user = userEvent.setup();
    vi.spyOn(medplum, 'post').mockRejectedValue(new Error('Incorrect password'));
    await renderSettingsPage(medplum, <SecuritySettingsPage />);

    await user.click(screen.getByRole('button', { name: 'Change password' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Current password/), 'old');
    await user.type(within(dialog).getByLabelText(/^New password/), 'a');
    await user.type(within(dialog).getByLabelText(/Confirm new password/), 'a');
    await user.click(within(dialog).getByRole('button', { name: 'Change password' }));

    expect(await within(dialog).findByText('Incorrect password')).toBeInTheDocument();
  });

  test('offers MFA setup when not enrolled', async () => {
    const user = userEvent.setup();
    await renderSettingsPage(medplum, <SecuritySettingsPage />);

    await user.click(await screen.findByRole('button', { name: 'Set up' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  test('disables MFA when enrolled', async () => {
    const user = userEvent.setup();
    const get = medplum.get.bind(medplum);
    vi.spyOn(medplum, 'get').mockImplementation(((url: string, options?: any) =>
      url.toString().includes('auth/mfa/status')
        ? Promise.resolve({ enrolled: true, enrolledMethods: ['totp'], allowedMethods: ['totp'] })
        : get(url, options)) as any);
    await renderSettingsPage(medplum, <SecuritySettingsPage />);

    expect(await screen.findByText('Enabled with Authenticator app.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Disable' }));
    expect(await screen.findByRole('dialog', { name: 'Disable MFA' })).toBeInTheDocument();
  });
});
