// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { DrAliceSmith, MockClient } from '@medplum/mock';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { screen, userEvent, waitFor } from '../../test-utils/render';
import { AccountSettingsPage } from './AccountSettingsPage';
import { renderSettingsPage } from './settingsTestUtils';

describe('AccountSettingsPage', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient({ profile: DrAliceSmith });
  });

  test('shows the profile name and links to the profile resource', async () => {
    await renderSettingsPage(medplum, <AccountSettingsPage />);
    expect(screen.getByRole('heading', { name: 'Account' })).toBeInTheDocument();
    expect(screen.getByLabelText('First name')).toHaveValue('Alice');
    expect(screen.getByLabelText('Last name')).toHaveValue('Smith');
    expect(screen.getByText('View resource')).toHaveAttribute('href', `/Practitioner/${DrAliceSmith.id}`);
  });

  test('saves an edited name', async () => {
    const user = userEvent.setup();
    const updateSpy = vi.spyOn(medplum, 'updateResource');
    await renderSettingsPage(medplum, <AccountSettingsPage />);

    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();

    await user.clear(screen.getByLabelText('Last name'));
    await user.type(screen.getByLabelText('Last name'), 'Jones');
    await user.click(save);

    await waitFor(() => expect(updateSpy).toHaveBeenCalled());
    expect(updateSpy.mock.calls[0][0]).toMatchObject({ name: [{ given: ['Alice'], family: 'Jones' }] });
    expect(await screen.findByText('Account updated')).toBeInTheDocument();
  });

  test('reports a failed save', async () => {
    const user = userEvent.setup();
    vi.spyOn(medplum, 'updateResource').mockRejectedValue(new Error('Nope'));
    await renderSettingsPage(medplum, <AccountSettingsPage />);

    await user.type(screen.getByLabelText('First name'), 'x');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Nope')).toBeInTheDocument();
  });
});
