// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import * as reactRouter from 'react-router';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { EncounterModal } from './EncounterModal';
import * as usePatientModule from '../../hooks/usePatient';
import type { Patient } from '@medplum/fhirtypes';

vi.mock('../../utils/encounter', () => ({
  createEncounter: vi.fn(),
}));

const mockPatient: Patient = {
  resourceType: 'Patient',
  id: 'patient-123',
  name: [{ given: ['John'], family: 'Doe' }],
};
describe('EncounterModal', () => {
  let medplum: MockClient;
  let navigateSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
    navigateSpy = vi.fn();
    vi.spyOn(reactRouter, 'useNavigate').mockReturnValue(navigateSpy as any);
    vi.spyOn(usePatientModule, 'usePatient').mockReturnValue(mockPatient);
  });

  function setup(): ReturnType<typeof render> {
    return render(
      <MemoryRouter initialEntries={['/Patient/patient-123/Encounter/new']}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <Routes>
              <Route path="/Patient/:patientId/Encounter/new" element={<EncounterModal />} />
            </Routes>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  test('Renders all form fields', async () => {
    setup();

    await waitFor(() => {
      expect(screen.getByLabelText(/Start Time/i)).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/End Time/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Class/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Status/i)).toBeInTheDocument();
    expect(screen.getByText('Apply care template')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create Encounter/i })).toBeInTheDocument();
  });

  test('Shows error notification when required fields are missing', async () => {
    const user = userEvent.setup();
    setup();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Create Encounter/i })).toBeInTheDocument();
    });

    const createButton = screen.getByRole('button', { name: /Create Encounter/i });
    await act(async () => {
      await user.click(createButton);
    });

    await waitFor(() => {
      expect(screen.getByText('Please fill out required fields.')).toBeInTheDocument();
    });
  });

  test('Modal renders with dialog role', async () => {
    setup();

    await waitFor(() => {
      expect(screen.getByText('New encounter')).toBeInTheDocument();
    });

    // Verify modal is rendered as a dialog
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  test('Displays care template section', () => {
    setup();

    expect(screen.getByText('Apply care template')).toBeInTheDocument();
    expect(screen.getByText(/You can select template for new encounter/i)).toBeInTheDocument();
  });
});
