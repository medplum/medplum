// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Notifications } from '@mantine/notifications';
import { allOk } from '@medplum/core';
import type { Organization, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { PatientAccountsForm } from './PatientAccountsForm';

const testOrg: Organization = {
  resourceType: 'Organization',
  id: 'org-1',
  name: 'Test Organization',
};

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
    // Ensure the org resource is available for ResourceBadge to resolve
    await client.createResourceIfNoneExist(testOrg, 'name=Test Organization');

    await act(async () => {
      render(
        <MemoryRouter>
          <Notifications />
          <MedplumProvider medplum={client}>
            <PatientAccountsForm patient={patient} />
          </MedplumProvider>
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
    // Organization badge should be rendered
    expect(screen.getByText('Organization')).toBeInTheDocument();
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

    const saveButton = screen.getByText('Save Changes');
    expect(saveButton).toBeDisabled();
  });

  test('Save button is enabled when there are changes', async () => {
    await setup(testPatientWithAccounts);

    // Remove an account to create a change
    const removeButton = screen.getByLabelText('Remove Organization/org-1');
    await act(async () => {
      fireEvent.click(removeButton);
    });

    const saveButton = screen.getByText('Save Changes');
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
    const saveButton = screen.getByText('Save Changes');
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

    const saveButton = screen.getByText('Save Changes');
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

    const saveButton = screen.getByText('Save Changes');
    await act(async () => {
      fireEvent.click(saveButton);
    });

    expect(screen.getByText('Confirm Account Changes')).toBeInTheDocument();

    const cancelButton = screen.getByText('Cancel');
    await act(async () => {
      fireEvent.click(cancelButton);
    });

    // Modal should be closed
    expect(screen.queryByText('Confirm Account Changes')).not.toBeInTheDocument();
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
    const saveButton = screen.getByText('Save Changes');
    await act(async () => {
      fireEvent.click(saveButton);
    });

    // Confirm
    const confirmButton = screen.getByText('Confirm');
    await act(async () => {
      fireEvent.click(confirmButton);
    });

    // Should have called $set-accounts
    expect(postSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        resourceType: 'Parameters',
        parameter: expect.arrayContaining([{ name: 'propagate', valueBoolean: true }]),
      }),
      undefined,
      expect.objectContaining({
        headers: { Prefer: 'respond-async' },
      })
    );
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
    const saveButton = screen.getByText('Save Changes');
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

    expect(postSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        resourceType: 'Parameters',
        parameter: expect.arrayContaining([{ name: 'propagate', valueBoolean: false }]),
      }),
      undefined,
      expect.objectContaining({
        headers: {},
      })
    );
  });
});
