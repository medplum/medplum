// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { loadDataType } from '@medplum/core';
import type { StructureDefinition } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import * as reactRouter from 'react-router';
import { describe, expect, test, vi, beforeEach, beforeAll } from 'vitest';
import { EditTab } from './EditTab';

describe('EditTab', () => {
  let medplum: MockClient;
  let navigateSpy: ReturnType<typeof vi.fn>;

  beforeAll(() => {
    // Load a minimal US Core Patient profile schema for tests
    const usCorePatientProfile: StructureDefinition = {
      resourceType: 'StructureDefinition',
      id: 'us-core-patient',
      url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient',
      name: 'USCorePatientProfile',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Patient',
      derivation: 'constraint',
      snapshot: {
        element: [
          {
            id: 'Patient',
            path: 'Patient',
            definition: 'US Core Patient Profile',
          },
        ],
      },
    };
    loadDataType(usCorePatientProfile);
  });

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();
    navigateSpy = vi.fn();
    vi.spyOn(reactRouter, 'useNavigate').mockReturnValue(navigateSpy as any);
    // Mock requestProfileSchema to resolve successfully
    vi.spyOn(medplum, 'requestProfileSchema').mockResolvedValue(undefined);
  });

  const setup = (url: string): ReturnType<typeof render> => {
    return render(
      <MemoryRouter initialEntries={[url]}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <Routes>
              <Route path="/Patient/:patientId/edit" element={<EditTab />} />
            </Routes>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  const getUpdateButton = async (): Promise<HTMLElement> => {
    await waitFor(
      () => {
        const buttons = screen.getAllByRole('button');
        const updateButton = buttons.find((btn) => btn.textContent === 'Update');
        expect(updateButton).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    const buttons = screen.getAllByRole('button');
    const updateButton = buttons.find((btn) => btn.textContent === 'Update');
    if (!updateButton) {
      throw new Error('Update button not found');
    }
    return updateButton;
  };

  test('Loads patient data', async () => {
    const readResourceSpy = vi.spyOn(medplum, 'readResource');
    setup(`/Patient/${HomerSimpson.id}/edit`);

    await waitFor(() => {
      expect(readResourceSpy).toHaveBeenCalledWith('Patient', HomerSimpson.id);
    });
  });

  test('Submit updates patient and navigates', async () => {
    const user = userEvent.setup();
    setup(`/Patient/${HomerSimpson.id}/edit`);

    const updateButton = await getUpdateButton();

    vi.spyOn(medplum, 'updateResource').mockResolvedValue(HomerSimpson as any);
    await user.click(updateButton);

    await waitFor(() => {
      expect(medplum.updateResource).toHaveBeenCalled();
      expect(screen.getByText('Success')).toBeInTheDocument();
      expect(navigateSpy).toHaveBeenCalledWith(`/Patient/${HomerSimpson.id}/timeline`);
    });
  });

  test('Handles update error', async () => {
    const user = userEvent.setup();
    setup(`/Patient/${HomerSimpson.id}/edit`);

    const updateButton = await getUpdateButton();

    const error = new Error('Failed to update patient');
    vi.spyOn(medplum, 'updateResource').mockRejectedValue(error);

    await user.click(updateButton);

    await waitFor(() => {
      expect(medplum.updateResource).toHaveBeenCalled();
      expect(screen.getByText(/failed to update patient/i)).toBeInTheDocument();
    });
  });

  test('Handles load error', async () => {
    vi.spyOn(medplum, 'readResource').mockRejectedValue(new Error('Patient not found'));

    setup('/Patient/non-existent/edit');

    await waitFor(() => {
      expect(medplum.readResource).toHaveBeenCalled();
      expect(screen.getByText(/patient not found/i)).toBeInTheDocument();
    });
  });
});
