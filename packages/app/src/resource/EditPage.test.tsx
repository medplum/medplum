import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { Practitioner } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { ErrorBoundary, Loading, MedplumProvider } from '@medplum/react';
import { Suspense } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../AppRoutes';
import { act, fireEvent, render, screen } from '../test-utils/render';

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
    expect(await screen.findByText('Edit')).toBeInTheDocument();
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
    expect(await screen.findByText('Delete')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Delete'));
    });

    expect(await screen.findByText('Are you sure you want to delete this Practitioner?')).toBeInTheDocument();
  });
});
