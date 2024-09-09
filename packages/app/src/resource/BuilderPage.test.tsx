import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import { PlanDefinition, Questionnaire } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { ErrorBoundary, Loading, MedplumProvider } from '@medplum/react';
import { Suspense } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../AppRoutes';
import { act, fireEvent, render, screen } from '../test-utils/render';

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

  afterEach(async () => {
    await act(async () => notifications.clean());
  });

  test('PlanDefinition builder', async () => {
    const planDefinition = await medplum.createResource<PlanDefinition>({
      resourceType: 'PlanDefinition',
    } as PlanDefinition);

    await setup(`/PlanDefinition/${planDefinition.id}/builder`);
    expect(await screen.findByRole('button', { name: 'Save' })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    expect(screen.getByText('Success')).toBeInTheDocument();
  });

  test('Questionnaire builder', async () => {
    const questionnaire = await medplum.createResource<Questionnaire>({
      resourceType: 'Questionnaire',
    } as Questionnaire);

    await setup(`/Questionnaire/${questionnaire.id}/builder`);
    expect(await screen.findByRole('button', { name: 'Save' })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    expect(screen.getByText('Success')).toBeInTheDocument();
  });
});
