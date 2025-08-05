// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { ChangePasswordPage } from './ChangePasswordPage';
import { render, screen, UserEvent, userEvent, waitFor } from './test-utils/render';

const medplum = new MockClient();

function setup(): UserEvent {
  const user = userEvent.setup();
  render(
    <MedplumProvider medplum={medplum}>
      <ChangePasswordPage />
    </MedplumProvider>
  );
  return user;
}

describe('ChangePasswordPage', () => {
  test('Renders', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Change password' })).toBeInTheDocument();
  });

  test('Submit success', async () => {
    const user = setup();

    await user.type(screen.getByLabelText('Old password *'), 'orange');
    await user.type(screen.getByLabelText('New password *'), 'purple');
    await user.type(screen.getByLabelText('Confirm new password *'), 'purple');

    await user.click(screen.getByRole('button'));

    await waitFor(async () => {
      expect(screen.getByTestId('success')).toBeInTheDocument();
    });
  });

  test('Wrong old password', async () => {
    const user = setup();

    await user.type(screen.getByLabelText('Old password *'), 'watermelon');
    await user.type(screen.getByLabelText('New password *'), 'purple');
    await user.type(screen.getByLabelText('Confirm new password *'), 'purple');

    await user.click(screen.getByRole('button'));

    await waitFor(async () => {
      expect(screen.getByText('Incorrect password')).toBeInTheDocument();
    });
  });
});
