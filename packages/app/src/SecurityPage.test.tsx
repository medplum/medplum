import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from './AppRoutes';
import { act, fireEvent, render, screen } from './test-utils/render';

const medplum = new MockClient();

async function setup(): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={['/security']} initialIndex={0}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <AppRoutes />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  });
}

describe('SecurityPage', () => {
  test('Renders', async () => {
    await setup();
    expect(screen.getByText('Sessions')).toBeInTheDocument();
  });

  test('Click change password', async () => {
    await setup();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    });
    expect(screen.getByLabelText('Old password *')).toBeInTheDocument();
    expect(screen.getByLabelText('New password *')).toBeInTheDocument();
  });

  test('Click MFA enroll', async () => {
    await setup();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enroll' }));
    });
    expect(screen.getByText('Multi Factor Auth Setup')).toBeInTheDocument();
  });

  test('Revoke session', async () => {
    await setup();

    const revokeLinks = screen.getAllByText('Revoke');
    expect(revokeLinks).toHaveLength(2);

    await act(async () => {
      fireEvent.click(revokeLinks[1]);
    });

    expect(await screen.findByText('Login revoked')).toBeInTheDocument();
  });
});
