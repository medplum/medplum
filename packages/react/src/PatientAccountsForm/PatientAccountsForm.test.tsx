// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { allOk } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { PatientAccountsForm } from './PatientAccountsForm';

const testPatientWithAccounts: Patient = {
  resourceType: 'Patient',
  id: '123',
  name: [{ given: ['Homer'], family: 'Simpson' }],
  meta: {
    accounts: [{ reference: 'Organization/org-1', display: 'Test Organization' }],
  },
};

const testPatientNoAccounts: Patient = {
  resourceType: 'Patient',
  id: '456',
  name: [{ given: ['Marge'], family: 'Simpson' }],
};

function createAdminMockClient(): MockClient {
  const medplum = new MockClient();
  jest.spyOn(medplum, 'isProjectAdmin').mockReturnValue(true);
  medplum.router.add('POST', '/Patient/:id/$set-accounts', async () => [
    allOk,
    {
      resourceType: 'Parameters',
      parameter: [{ name: 'resourcesUpdated', valueInteger: 1 }],
    },
  ]);
  return medplum;
}

describe('PatientAccountsForm', () => {
  async function setup(patient: Patient, medplum?: MockClient): Promise<MockClient> {
    const client = medplum ?? createAdminMockClient();

    await act(async () => {
      render(
        <MemoryRouter>
          <MantineProvider>
            <Notifications />
            <MedplumProvider medplum={client}>
              <PatientAccountsForm patient={patient} />
            </MedplumProvider>
          </MantineProvider>
        </MemoryRouter>
      );
    });
    return client;
  }

  test('Renders non-admin message when user is not admin', async () => {
    const medplum = new MockClient();
    jest.spyOn(medplum, 'isProjectAdmin').mockReturnValue(false);
    jest.spyOn(medplum, 'isSuperAdmin').mockReturnValue(false);
    await setup(testPatientWithAccounts, medplum);

    expect(screen.getByText('Admin access required')).toBeInTheDocument();
    expect(screen.queryByText('Current Accounts')).not.toBeInTheDocument();
  });

  test('Renders current accounts', async () => {
    await setup(testPatientWithAccounts);

    expect(screen.getByText('Current Accounts')).toBeInTheDocument();
    // Organization badge and reference should be rendered
    expect(screen.getAllByText('Organization').length).toBeGreaterThanOrEqual(1);
  });

  test('Renders empty state when no accounts', async () => {
    await setup(testPatientNoAccounts);

    expect(screen.getByText('Current Accounts')).toBeInTheDocument();
    expect(screen.getByText('No accounts assigned to this patient.')).toBeInTheDocument();
  });

  test('Remove account shows pending changes', async () => {
    await setup(testPatientWithAccounts);

    // Click the remove button
    const removeButton = screen.getByLabelText('Remove Organization/org-1');
    await act(async () => {
      fireEvent.click(removeButton);
    });

    // Should show pending changes
    expect(screen.getByText('Pending Changes')).toBeInTheDocument();
    expect(screen.getByText('Remove')).toBeInTheDocument();
  });

  test('Save button is disabled when no changes', async () => {
    await setup(testPatientWithAccounts);

    const saveButton = screen.getByRole('button', { name: 'Save Changes' });
    expect(saveButton).toBeDisabled();
  });

  test('Save button is enabled when there are changes', async () => {
    await setup(testPatientWithAccounts);

    // Remove an account to create a change
    const removeButton = screen.getByLabelText('Remove Organization/org-1');
    await act(async () => {
      fireEvent.click(removeButton);
    });

    const saveButton = screen.getByRole('button', { name: 'Save Changes' });
    expect(saveButton).not.toBeDisabled();
  });

  test('Clicking Save opens confirmation modal', async () => {
    await setup(testPatientWithAccounts);

    // Remove an account to create a change
    const removeButton = screen.getByLabelText('Remove Organization/org-1');
    await act(async () => {
      fireEvent.click(removeButton);
    });

    // Click save
    const saveButton = screen.getByRole('button', { name: 'Save Changes' });
    await act(async () => {
      fireEvent.click(saveButton);
    });

    // Modal should appear
    expect(screen.getByText('Confirm Account Changes')).toBeInTheDocument();
    expect(screen.getByText('Removing:')).toBeInTheDocument();
  });

  test('Confirm modal has propagate checkbox checked by default', async () => {
    await setup(testPatientWithAccounts);

    const removeButton = screen.getByLabelText('Remove Organization/org-1');
    await act(async () => {
      fireEvent.click(removeButton);
    });

    const saveButton = screen.getByRole('button', { name: 'Save Changes' });
    await act(async () => {
      fireEvent.click(saveButton);
    });

    const checkbox = screen.getByLabelText("Propagate changes to all resources in this patient's compartment");
    expect(checkbox).toBeChecked();
  });

  test('Cancel closes the modal without saving', async () => {
    await setup(testPatientWithAccounts);

    const removeButton = screen.getByLabelText('Remove Organization/org-1');
    await act(async () => {
      fireEvent.click(removeButton);
    });

    const saveButton = screen.getByRole('button', { name: 'Save Changes' });
    await act(async () => {
      fireEvent.click(saveButton);
    });

    expect(screen.getByText('Confirm Account Changes')).toBeInTheDocument();

    const cancelButton = screen.getByText('Cancel');
    await act(async () => {
      fireEvent.click(cancelButton);
    });

    // Modal should be closed — confirm button should no longer be visible
    // (With keepMounted the title stays in DOM, so we check the Confirm action button is gone)
    expect(screen.getByRole('button', { name: 'Save Changes' })).not.toBeDisabled();
  });

  test('Confirm triggers $set-accounts call', async () => {
    const medplum = createAdminMockClient();
    const postSpy = jest.spyOn(medplum, 'post');
    await setup(testPatientWithAccounts, medplum);

    // Remove an account
    const removeButton = screen.getByLabelText('Remove Organization/org-1');
    await act(async () => {
      fireEvent.click(removeButton);
    });

    // Open modal
    const saveButton = screen.getByRole('button', { name: 'Save Changes' });
    await act(async () => {
      fireEvent.click(saveButton);
    });

    // Confirm
    const confirmButton = screen.getByText('Confirm');
    await act(async () => {
      fireEvent.click(confirmButton);
    });

    // Should have called $set-accounts with propagate and respond-async header
    expect(postSpy).toHaveBeenCalled();
    const [callUrl, callBody, , callOptions] = postSpy.mock.calls[0];
    expect(callUrl.toString()).toContain('$set-accounts');
    expect(callBody).toEqual(
      expect.objectContaining({
        resourceType: 'Parameters',
        parameter: expect.arrayContaining([{ name: 'propagate', valueBoolean: true }]),
      })
    );
    expect((callOptions?.headers as Record<string, string>)?.['Prefer']).toBe('respond-async');
  });

  test('Confirm without propagate does not send async header', async () => {
    const medplum = createAdminMockClient();
    const postSpy = jest.spyOn(medplum, 'post');
    await setup(testPatientWithAccounts, medplum);

    // Remove an account
    const removeButton = screen.getByLabelText('Remove Organization/org-1');
    await act(async () => {
      fireEvent.click(removeButton);
    });

    // Open modal
    const saveButton = screen.getByRole('button', { name: 'Save Changes' });
    await act(async () => {
      fireEvent.click(saveButton);
    });

    // Uncheck propagate
    const checkbox = screen.getByLabelText("Propagate changes to all resources in this patient's compartment");
    await act(async () => {
      fireEvent.click(checkbox);
    });

    // Confirm
    const confirmButton = screen.getByText('Confirm');
    await act(async () => {
      fireEvent.click(confirmButton);
    });

    // Should have called $set-accounts with propagate=false and no respond-async header
    expect(postSpy).toHaveBeenCalled();
    const [callUrl, callBody, , callOptions] = postSpy.mock.calls[0];
    expect(callUrl.toString()).toContain('$set-accounts');
    expect(callBody).toEqual(
      expect.objectContaining({
        resourceType: 'Parameters',
        parameter: expect.arrayContaining([{ name: 'propagate', valueBoolean: false }]),
      })
    );
    expect((callOptions?.headers as Record<string, string>)?.['Prefer']).toBeUndefined();
  });
});
