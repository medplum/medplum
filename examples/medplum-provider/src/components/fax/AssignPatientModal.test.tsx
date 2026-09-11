// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import type { Patient, Reference } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { AssignPatientModal } from './AssignPatientModal';

// A name no MockClient fixture shares, so the autocomplete offers exactly one option.
const PATIENT: WithId<Patient> = {
  resourceType: 'Patient',
  id: 'patient-1',
  name: [{ given: ['Bartholomew'], family: 'Faxman' }],
};

describe('AssignPatientModal', () => {
  let medplum: MockClient;
  let onClose: () => void;
  let onAssigned: () => void;

  beforeEach(async () => {
    medplum = new MockClient();
    await medplum.createResource(PATIENT);
    onClose = vi.fn();
    onAssigned = vi.fn();
    vi.clearAllMocks();
  });

  function setup(props: { opened?: boolean; defaultPatient?: Reference<Patient> } = {}): ReturnType<typeof render> {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <AssignPatientModal
              opened={props.opened ?? true}
              onClose={onClose}
              resourceType="Communication"
              resourceId="fax-1"
              onAssigned={onAssigned}
              defaultPatient={props.defaultPatient}
            />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  test('Renders nothing while closed', () => {
    setup({ opened: false });
    expect(screen.queryByText('Assign Patient')).not.toBeInTheDocument();
  });

  test('Requires a patient before assigning', () => {
    setup();
    expect(screen.getByText('Select Patient')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Assign Patient' })).toBeDisabled();
    // Nothing is assigned yet, so there is nothing to remove.
    expect(screen.queryByRole('button', { name: 'Remove Assigned Patient' })).not.toBeInTheDocument();
  });

  test('Assigns a patient searched from the input', async () => {
    const patchResource = vi.spyOn(medplum, 'patchResource').mockResolvedValue(PATIENT);
    setup();

    await userEvent.type(screen.getByPlaceholderText('Type to search patients...'), 'Faxman');
    await userEvent.click(await screen.findByText('Bartholomew Faxman'));
    await userEvent.click(screen.getByRole('button', { name: 'Assign Patient' }));

    await waitFor(() =>
      expect(patchResource).toHaveBeenCalledWith('Communication', 'fax-1', [
        { op: 'add', path: '/subject', value: { reference: 'Patient/patient-1', display: 'Bartholomew Faxman' } },
      ])
    );
    expect(await screen.findByText('Patient assigned successfully')).toBeInTheDocument();
    expect(onAssigned).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('Assigns the pre-selected patient without further input', async () => {
    const patchResource = vi.spyOn(medplum, 'patchResource').mockResolvedValue(PATIENT);
    setup({ defaultPatient: { reference: 'Patient/patient-1' } });

    await userEvent.click(screen.getByRole('button', { name: 'Assign Patient' }));

    await waitFor(() =>
      expect(patchResource).toHaveBeenCalledWith('Communication', 'fax-1', [
        { op: 'add', path: '/subject', value: { reference: 'Patient/patient-1' } },
      ])
    );
  });

  test('Surfaces a failed assignment and stays open', async () => {
    vi.spyOn(medplum, 'patchResource').mockRejectedValue(new Error('Patch failed'));
    setup({ defaultPatient: { reference: 'Patient/patient-1' } });

    await userEvent.click(screen.getByRole('button', { name: 'Assign Patient' }));

    expect(await screen.findByText('Patch failed')).toBeInTheDocument();
    expect(onAssigned).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  test('Removes an existing assignment', async () => {
    const patchResource = vi.spyOn(medplum, 'patchResource').mockResolvedValue(PATIENT);
    setup({ defaultPatient: { reference: 'Patient/patient-1' } });

    await userEvent.click(screen.getByRole('button', { name: 'Remove Assigned Patient' }));

    await waitFor(() =>
      expect(patchResource).toHaveBeenCalledWith('Communication', 'fax-1', [{ op: 'remove', path: '/subject' }])
    );
    expect(await screen.findByText('Patient assignment removed successfully')).toBeInTheDocument();
    expect(onAssigned).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('Surfaces a failed removal', async () => {
    vi.spyOn(medplum, 'patchResource').mockRejectedValue(new Error('Remove failed'));
    setup({ defaultPatient: { reference: 'Patient/patient-1' } });

    await userEvent.click(screen.getByRole('button', { name: 'Remove Assigned Patient' }));

    expect(await screen.findByText('Remove failed')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  test('Closes without assigning', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
