import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { loadDataType } from '@medplum/core';
import { Patient, StructureDefinition } from '@medplum/fhirtypes';
import { FishPatientResources, MockClient } from '@medplum/mock';
import { ErrorBoundary, Loading, MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../AppRoutes';

const medplum = new MockClient();

describe('ProfilesPage', () => {
  const fishPatientProfile = FishPatientResources.getFishPatientProfileSD();
  beforeAll(async () => {
    const loadedProfileUrls: string[] = [];
    for (const profile of [fishPatientProfile, FishPatientResources.getFishSpeciesExtensionSD()]) {
      const sd = await medplum.createResourceIfNoneExist<StructureDefinition>(profile, `url:${profile.url}`);
      loadedProfileUrls.push(sd.url);
      loadDataType(sd, sd.url);
    }
    medplum.requestProfileSchema = jest.fn((profileUrl) => {
      if (loadedProfileUrls.includes(profileUrl)) {
        return Promise.resolve([profileUrl]);
      } else {
        throw new Error('unexpected profileUrl');
      }
    });
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
    expect(await screen.findByText('Available Patient profiles')).toBeInTheDocument();
  }

  test('Can add a profile to an empty resource', async () => {
    const patient = await medplum.createResource<Patient>({ resourceType: 'Patient' });
    await setup(`/Patient/${patient.id}/profiles`);

    // The form should not be rendered yet
    expect(screen.queryByText('Species')).toBeNull();

    // Click the tab of a profile
    await act(async () => {
      fireEvent.click(screen.getByText('Fish Patient'));
    });

    // Toggle comformance from false to true
    const toggleInput = screen.getByTestId<HTMLInputElement>('profile-toggle');
    expect(toggleInput.checked).toEqual(false);
    await act(async () => {
      fireEvent.click(toggleInput);
    });

    // The form should be rendered
    expect(screen.queryByText('Species')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    });

    expect(screen.getByText('Success')).toBeInTheDocument();

    const updatedPatient = await medplum.readResource('Patient', patient.id as string);
    expect(updatedPatient.meta?.profile?.includes(fishPatientProfile.url)).toEqual(true);
  });

  test('Can remove a profile from a resource with a profile', async () => {
    const patient = await medplum.createResource<Patient>(FishPatientResources.getSampleFishPatient());
    expect(patient.meta?.profile?.includes(fishPatientProfile.url)).toEqual(true);
    await setup(`/Patient/${patient.id}/profiles`);

    // Click the tab of a profile
    await act(async () => {
      fireEvent.click(screen.getByText('Fish Patient'));
    });

    // Toggle comformance from true to false
    const toggleInput = screen.getByTestId<HTMLInputElement>('profile-toggle');
    expect(toggleInput.checked).toEqual(true);
    await act(async () => {
      fireEvent.click(toggleInput);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    });

    const updatedPatient = await medplum.readResource('Patient', patient.id as string);
    expect(updatedPatient.meta?.profile?.includes(fishPatientProfile.url)).toEqual(false);
  });
});
