// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { MedicationsPage } from './MedicationsPage';

function createDoseSpotMembership(): ReturnType<MockClient['getProjectMembership']> {
  return {
    resourceType: 'ProjectMembership',
    id: 'test-membership',
    project: { reference: 'Project/test' },
    user: { reference: 'User/test' },
    profile: { reference: 'Practitioner/test' },
    identifier: [{ system: 'https://dosespot.com', value: '12345' }],
  };
}

async function setup(url: string, medplum = new MockClient()): Promise<MockClient> {
  await act(async () => {
    render(
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={[url]} initialIndex={0}>
          <MantineProvider>
            <Notifications />
            <Routes>
              <Route path="/Patient/:patientId/MedicationRequest" element={<MedicationsPage />} />
              <Route path="/Patient/:patientId/MedicationRequest/:resourceId" element={<div>Resource Detail</div>} />
              <Route path="/Patient/:patientId/MedicationRequest/new" element={<div>New Resource</div>} />
            </Routes>
          </MantineProvider>
        </MemoryRouter>
      </MedplumProvider>
    );
  });
  return medplum;
}

describe('MedicationsPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  test('Renders MedicationRequest search control', async () => {
    await setup(`/Patient/${HomerSimpson.id}/MedicationRequest`);
    expect(await screen.findByTestId('search-control')).toBeInTheDocument();
  });

  test('Renders with fields query params', async () => {
    await setup(`/Patient/${HomerSimpson.id}/MedicationRequest?_fields=id,_lastUpdated,medication,status`);
    expect(await screen.findByTestId('search-control')).toBeInTheDocument();
  });

  test('Shows loading state when patient is not available', async () => {
    await setup('/Patient/non-existent-patient/MedicationRequest');
    await waitFor(() => {
      const loader = document.querySelector('.mantine-Loader-root');
      expect(loader).toBeInTheDocument();
    });
  });

  test('Does not show DoseSpot sync button without DoseSpot identifier', async () => {
    await setup(`/Patient/${HomerSimpson.id}/MedicationRequest`);
    expect(await screen.findByTestId('search-control')).toBeInTheDocument();
    expect(screen.queryByText('Sync with DoseSpot')).not.toBeInTheDocument();
  });

  test('Shows DoseSpot sync button with DoseSpot identifier', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'getProjectMembership').mockReturnValue(createDoseSpotMembership());

    await setup(`/Patient/${HomerSimpson.id}/MedicationRequest`, medplum);
    expect(await screen.findByTestId('search-control')).toBeInTheDocument();
    expect(screen.getByText('Sync with DoseSpot')).toBeInTheDocument();
  });

  test('DoseSpot sync button triggers bot execution', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'getProjectMembership').mockReturnValue(createDoseSpotMembership());
    const executeBotSpy = vi.spyOn(medplum, 'executeBot').mockResolvedValue({});

    await setup(`/Patient/${HomerSimpson.id}/MedicationRequest`, medplum);
    expect(await screen.findByTestId('search-control')).toBeInTheDocument();

    const syncButton = screen.getByText('Sync with DoseSpot');
    await act(async () => {
      fireEvent.click(syncButton);
    });

    await waitFor(() => {
      // Should call executeBot 3 times (patient sync, prescriptions sync, medication history)
      expect(executeBotSpy).toHaveBeenCalledTimes(3);
    });
  });

  test('DoseSpot sync button shows syncing state while executing', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'getProjectMembership').mockReturnValue(createDoseSpotMembership());

    // Create a promise that we can control
    let resolveBots: () => void;
    const botPromise = new Promise<void>((resolve) => {
      resolveBots = resolve;
    });

    vi.spyOn(medplum, 'executeBot').mockImplementation(() => botPromise.then(() => ({})));

    await setup(`/Patient/${HomerSimpson.id}/MedicationRequest`, medplum);
    expect(await screen.findByTestId('search-control')).toBeInTheDocument();

    // Click sync button
    const syncButton = screen.getByText('Sync with DoseSpot');
    fireEvent.click(syncButton);

    // Should show syncing state immediately
    await waitFor(() => {
      expect(screen.getByText('Syncing…')).toBeInTheDocument();
    });

    // Resolve all bot calls
    await act(async () => {
      resolveBots();
    });

    // Should return to normal state
    await waitFor(() => {
      expect(screen.getByText('Sync with DoseSpot')).toBeInTheDocument();
    });
  });

  test('DoseSpot sync shows error notification on failure', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'getProjectMembership').mockReturnValue(createDoseSpotMembership());
    vi.spyOn(medplum, 'executeBot').mockRejectedValue(new Error('Network error'));

    await setup(`/Patient/${HomerSimpson.id}/MedicationRequest`, medplum);
    expect(await screen.findByTestId('search-control')).toBeInTheDocument();

    const syncButton = screen.getByText('Sync with DoseSpot');
    await act(async () => {
      fireEvent.click(syncButton);
    });

    await waitFor(() => {
      expect(screen.getByText('Error syncing with DoseSpot')).toBeInTheDocument();
    });
  });

  test('New button navigates to new resource page', async () => {
    await setup(`/Patient/${HomerSimpson.id}/MedicationRequest`);
    expect(await screen.findByText('New...')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('New...'));
    });

    await waitFor(() => {
      expect(screen.getByText('New Resource')).toBeInTheDocument();
    });
  });
});
