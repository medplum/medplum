import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../AppRoutes';

const medplum = new MockClient();

async function setup(url: string): Promise<void> {
  await act(async () => {
    render(
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={[url]} initialIndex={0}>
          <MantineProvider withGlobalStyles withNormalizeCSS>
            <Notifications />
            <AppRoutes />
          </MantineProvider>
        </MemoryRouter>
      </MedplumProvider>
    );
  });
}

describe('SecretsPage', () => {
  beforeAll(() => {
    medplum.setActiveLoginOverride({
      accessToken: '123',
      refreshToken: '456',
      profile: {
        reference: 'Practitioner/123',
      },
      project: {
        reference: 'Project/123',
      },
    });
  });

  test('Renders', async () => {
    await setup('/admin/secrets');
    await waitFor(() => screen.getByText('Project Secrets'));
    expect(screen.getByText('Project Secrets')).toBeInTheDocument();
  });

  test('Add and submit', async () => {
    await setup('/admin/secrets');
    await waitFor(() => screen.getByTitle('Add Secret'));

    // Click the "Add" button
    await act(async () => {
      fireEvent.click(screen.getByTitle('Add Secret'));
    });

    // Enter the secret name
    await act(async () => {
      fireEvent.change(screen.getByTestId('name'), { target: { value: 'foo' } });
    });

    // Enter the secret value
    await act(async () => {
      fireEvent.change(screen.getByTestId('value[x]'), { target: { value: 'bar' } });
    });

    // Click the "Save" button
    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    // Wait for the toast
    await waitFor(() => screen.getByText('Saved'));
  });
});
