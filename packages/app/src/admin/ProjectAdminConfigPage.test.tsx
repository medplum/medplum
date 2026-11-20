// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Notifications } from '@mantine/notifications';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AppRoutes } from '../AppRoutes';
import { render } from '../test-utils/render';

const medplum = new MockClient();

function setup(): void {
  render(
    <MedplumProvider medplum={medplum}>
      <MemoryRouter initialEntries={['/admin/config']} initialIndex={0}>
        <Notifications />
        <AppRoutes />
      </MemoryRouter>
    </MedplumProvider>
  );
}

describe('ProjectAdminConfigPage', () => {
  beforeEach(() => {
    vi.spyOn(medplum, 'isProjectAdmin').mockImplementation(() => true);
  });

  test('Force set password', async () => {
    setup();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Email *'), { target: { value: 'alice@example.com' } });
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Password *'), { target: { value: 'override123' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Force Set Password' }));
    });

    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  test('Access denied', async () => {
    vi.spyOn(medplum, 'isProjectAdmin').mockImplementationOnce(() => false);
    setup();
    expect(screen.getByText('Forbidden')).toBeInTheDocument();
  });
});
