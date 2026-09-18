// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { loadDataType } from '@medplum/core';
import type { StructureDefinition } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { PatientEditModal } from './PatientEditModal';

describe('PatientEditModal', () => {
  let medplum: MockClient;

  beforeAll(() => {
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
        element: [{ id: 'Patient', path: 'Patient', definition: 'US Core Patient Profile' }],
      },
    };
    loadDataType(usCorePatientProfile);
  });

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
    vi.spyOn(medplum, 'requestProfileSchema').mockResolvedValue(undefined);
  });

  const setup = (opened = true, onClose = vi.fn()): ReturnType<typeof render> => {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <PatientEditModal patient={HomerSimpson} opened={opened} onClose={onClose} />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  const getForm = async (): Promise<HTMLFormElement> => {
    await waitFor(() => {
      expect(document.querySelector('form')).toBeInTheDocument();
    });
    const form = document.querySelector('form');
    if (!form) {
      throw new Error('Form not found');
    }
    return form;
  };

  test('Loads patient data when opened', async () => {
    const readResourceSpy = vi.spyOn(medplum, 'readResource');
    setup(true);

    await waitFor(() => {
      expect(readResourceSpy).toHaveBeenCalledWith('Patient', HomerSimpson.id);
    });
    expect(screen.getByText('Edit Patient Profile Details')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  test('Does not load patient data when closed', () => {
    const readResourceSpy = vi.spyOn(medplum, 'readResource');
    setup(false);
    expect(readResourceSpy).not.toHaveBeenCalled();
    expect(screen.queryByText('Edit Patient Profile Details')).not.toBeInTheDocument();
  });

  test('Saves patient and closes on success', async () => {
    const onClose = vi.fn();
    setup(true, onClose);

    const form = await getForm();
    const updateSpy = vi.spyOn(medplum, 'updateResource').mockResolvedValue(HomerSimpson as any);

    fireEvent.submit(form);

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalled();
      expect(screen.getByText('Success')).toBeInTheDocument();
      expect(onClose).toHaveBeenCalled();
    });
  });

  test('Shows an error and stays open when save fails', async () => {
    const onClose = vi.fn();
    setup(true, onClose);

    const form = await getForm();
    vi.spyOn(medplum, 'updateResource').mockRejectedValue(new Error('Failed to update patient'));

    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText(/failed to update patient/i)).toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  test('Shows an error when the patient cannot be loaded', async () => {
    vi.spyOn(medplum, 'readResource').mockRejectedValue(new Error('Patient not found'));
    setup(true);

    await waitFor(() => {
      expect(screen.getByText(/patient not found/i)).toBeInTheDocument();
    });
  });
});
