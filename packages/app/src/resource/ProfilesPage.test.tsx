import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { Patient, StructureDefinition } from '@medplum/fhirtypes';
import { FishPatientResources, MockClient } from '@medplum/mock';
import { ErrorBoundary, Loading, MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Suspense } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../AppRoutes';

const medplum = new MockClient();

describe('ProfilesPage', () => {
  beforeAll(async () => {
    for (const profile of [
      FishPatientResources.getFishPatientProfileSD(),
      FishPatientResources.getFishSpeciesExtensionSD(),
    ]) {
      await medplum.createResourceIfNoneExist<StructureDefinition>(profile, `url:${profile.url}`);
    }
  });

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
    await waitFor(() => screen.getByText('Available Patient profiles'));
  }

  test('Profiles tab automatically shows form when resource already has profile', async () => {
    const patient = await medplum.createResource<Patient>(FishPatientResources.getSampleFishPatient());
    await setup(`/Patient/${patient.id}/profiles`);

    expect(screen.getByText('Available Patient profiles')).toBeInTheDocument();

    // The name of the available profile
    expect(screen.getByText('Fish Patient')).toBeInTheDocument();

    // An element name from the profile
    expect(screen.getByText('Species')).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: 'OK' })).toBeInTheDocument();
  });

  test('Can add a profile to an empty resource', async () => {
    const patient = await medplum.createResource<Patient>({ resourceType: 'Patient' });
    await setup(`/Patient/${patient.id}/profiles`);

    // The name of the available profile
    expect(screen.queryByText('Fish Patient')).toBeInTheDocument();

    // The form should not be rendered yet
    expect(screen.queryByText('Species')).toBeNull();

    expect(screen.queryByRole('button', { name: 'OK' })).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Fish Patient' }));
    });

    expect(screen.queryByRole('button', { name: 'OK' })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    });

    expect(screen.getByText('Success')).toBeInTheDocument();
  });

  test('Delete button on edit page', async () => {
    const patient = await medplum.createResource<Patient>(FishPatientResources.getSampleFishPatient());
    await setup(`/Patient/${patient.id}/profiles`);

    await waitFor(() => screen.getByText('Delete'));
    expect(screen.getByText('Delete')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Delete'));
    });

    await waitFor(() => screen.getByText('Are you sure you want to delete this Patient?'));
    expect(screen.getByText('Are you sure you want to delete this Patient?')).toBeInTheDocument();
  });
});
