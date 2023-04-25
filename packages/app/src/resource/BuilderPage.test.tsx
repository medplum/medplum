import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { PlanDefinition, Questionnaire } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { ErrorBoundary, Loading, MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React, { Suspense } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../AppRoutes';

const medplum = new MockClient();

describe('BuilderPage', () => {
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

  test('PlanDefinition builder', async () => {
    const planDefinition = await medplum.createResource<PlanDefinition>({
      resourceType: 'PlanDefinition',
    });

    await setup(`/PlanDefinition/${planDefinition.id}/builder`);
    await waitFor(() => screen.getByRole('button', { name: 'Save' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    expect(screen.getByText('Success')).toBeInTheDocument();
  });

  test('Questionnaire builder', async () => {
    const questionnaire = await medplum.createResource<Questionnaire>({
      resourceType: 'Questionnaire',
    });

    await setup(`/Questionnaire/${questionnaire.id}/builder`);
    await waitFor(() => screen.getByRole('button', { name: 'Save' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    expect(screen.getByText('Success')).toBeInTheDocument();
  });
});
