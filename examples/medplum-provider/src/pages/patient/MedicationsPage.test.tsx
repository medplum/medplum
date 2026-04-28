// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
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
  vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as any);
  await act(async () => {
    render(
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={[url]} initialIndex={0}>
          <MantineProvider>
            <Notifications />
            <Routes>
              <Route path="/Patient/:patientId/MedicationRequest" element={<MedicationsPage />} />
              <Route path="/Patient/:patientId/MedicationRequest/:medicationRequestId" element={<MedicationsPage />} />
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

  test('Renders medication tabs and order action', async () => {
    await setup(`/Patient/${HomerSimpson.id}/MedicationRequest`);
    expect(await screen.findByText('Active')).toBeInTheDocument();
    expect(await screen.findByText('Draft')).toBeInTheDocument();
    expect(await screen.findByText('Completed')).toBeInTheDocument();
    expect(await screen.findByLabelText('Order medication')).toBeInTheDocument();
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
    expect(await screen.findByText('Active')).toBeInTheDocument();
    expect(screen.queryByText('DoseSpot sync')).not.toBeInTheDocument();
  });

  test('Shows DoseSpot sync button with DoseSpot identifier', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as any);
    vi.spyOn(medplum, 'getProjectMembership').mockReturnValue(createDoseSpotMembership());

    await setup(`/Patient/${HomerSimpson.id}/MedicationRequest`, medplum);
    expect(await screen.findByText('DoseSpot sync')).toBeInTheDocument();
  });

  test('DoseSpot sync button triggers bot execution', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as any);
    vi.spyOn(medplum, 'getProjectMembership').mockReturnValue(createDoseSpotMembership());
    const executeBotSpy = vi.spyOn(medplum, 'executeBot').mockResolvedValue({});

    await setup(`/Patient/${HomerSimpson.id}/MedicationRequest`, medplum);
    expect(await screen.findByText('DoseSpot sync')).toBeInTheDocument();

    const syncButton = screen.getByText('DoseSpot sync');
    await act(async () => {
      fireEvent.click(syncButton);
    });

    await waitFor(() => {
      expect(executeBotSpy).toHaveBeenCalledTimes(3);
    });
  });
});
