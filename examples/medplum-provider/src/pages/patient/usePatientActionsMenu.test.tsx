// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider, Menu } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { loadDataType } from '@medplum/core';
import type { Patient, Reference, StructureDefinition } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { JSX } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { usePatientActionsMenu } from './usePatientActionsMenu';

describe('usePatientActionsMenu', () => {
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

  function Harness(props: { readonly patient: Patient | Reference<Patient> | undefined }): JSX.Element {
    const { headerMenuItems, actionsModals } = usePatientActionsMenu(props.patient);
    return (
      <>
        <Menu opened>
          <Menu.Dropdown>{headerMenuItems}</Menu.Dropdown>
        </Menu>
        {actionsModals}
      </>
    );
  }

  const setup = (patient: Patient | Reference<Patient> | undefined): ReturnType<typeof render> => {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <Harness patient={patient} />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('Renders the edit menu item', () => {
    setup(HomerSimpson);
    expect(screen.getByText('Edit Patient Profile Details')).toBeInTheDocument();
  });

  test('Opens the edit modal when the menu item is clicked', async () => {
    setup(HomerSimpson);

    fireEvent.click(screen.getByText('Edit Patient Profile Details'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    });
  });

  test('Renders no modal while the patient is unresolved', () => {
    setup(undefined);
    expect(screen.getByText('Edit Patient Profile Details')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });
});
