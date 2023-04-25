import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { Practitioner } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { ErrorBoundary, Loading, MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React, { Suspense } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../AppRoutes';

const medplum = new MockClient();

describe('EditPage', () => {
  async function setup(url: string): Promise<void> {
    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <MemoryRouter initialEntries={[url]} initialIndex={0}>
            <MantineProvider>
              <Notifications />
              <ErrorBoundary>
                <Suspense fallback={<Loading />}>
                  <AppRoutes />
                </Suspense>
              </ErrorBoundary>
            </MantineProvider>
          </MemoryRouter>
        </MedplumProvider>
      );
    });
  }

  test('Edit tab renders', async () => {
    await setup('/Practitioner/123/edit');
    await waitFor(() => screen.getByText('Edit'));
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });

  test('Submit', async () => {
    const practitioner = await medplum.createResource<Practitioner>({
      resourceType: 'Practitioner',
      name: [{ family: 'Test' }],
    });

    await setup(`/Practitioner/${practitioner.id}/edit`);
    expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    });

    expect(screen.getByText('Success')).toBeInTheDocument();
  });

  test('Delete button on edit page', async () => {
    await setup('/Practitioner/123/edit');
    await waitFor(() => screen.getByText('Delete'));
    expect(screen.getByText('Delete')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Delete'));
    });

    await waitFor(() => screen.getByText('Are you sure you want to delete this Practitioner?'));
    expect(screen.getByText('Are you sure you want to delete this Practitioner?')).toBeInTheDocument();
  });
});
