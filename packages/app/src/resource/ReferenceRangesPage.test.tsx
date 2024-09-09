import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { ObservationDefinition } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { ErrorBoundary, Loading, MedplumProvider } from '@medplum/react';
import { Suspense } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../AppRoutes';
import { act, fireEvent, render, screen } from '../test-utils/render';

const medplum = new MockClient();

describe('ReferenceRangesPage', () => {
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

  test('Renders', async () => {
    const obsDef = await medplum.createResource<ObservationDefinition>({
      resourceType: 'ObservationDefinition',
      code: { text: 'test' },
    });

    await setup(`/ObservationDefinition/${obsDef.id}/ranges`);

    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  test('Submit', async () => {
    const obsDef = await medplum.createResource<ObservationDefinition>({
      resourceType: 'ObservationDefinition',
      code: { text: 'test' },
    });

    await setup(`/ObservationDefinition/${obsDef.id}/ranges`);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    expect(screen.getByText('Success')).toBeInTheDocument();
  });
});
