// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { cleanNotifications } from '@mantine/notifications';
import type { Practitioner, ProjectMembership } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, renderAppRoutes, screen, waitFor } from '../test-utils/render';
import { MemberTable } from './MembersTable';

const medplum = new MockClient();

async function setup(url: string): Promise<void> {
  renderAppRoutes(medplum, url);
}

async function addPractitionerMembership(name: string): Promise<ProjectMembership> {
  const practitioner = await medplum.createResource<Practitioner>({
    resourceType: 'Practitioner',
    name: [{ given: [name], family: 'Extra' }],
  });
  return medplum.createResource<ProjectMembership>({
    resourceType: 'ProjectMembership',
    project: { reference: 'Project/123' },
    user: { reference: 'User/123' },
    profile: { reference: `Practitioner/${practitioner.id}` },
  });
}

describe('MemberTable (Users page)', () => {
  beforeAll(() => {
    medplum.setActiveLoginOverride({
      accessToken: '123',
      refreshToken: '456',
      profile: {
        reference: 'Practitioner/124',
      },
      project: {
        reference: 'Project/123',
      },
    });
  });

  afterEach(() => {
    act(() => {
      cleanNotifications();
    });
  });

  test('Renders segmented control with all profile type options', async () => {
    await setup('/admin/users');
    // Wait for page to load, then verify all four segment labels are present
    expect(await screen.findByText('All')).toBeInTheDocument();
    expect(screen.getAllByText('Practitioner').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Patient').length).toBeGreaterThan(0);
    expect(screen.getAllByText('RelatedPerson').length).toBeGreaterThan(0);
  });

  test('Renders Invite New User button', async () => {
    await setup('/admin/users');
    expect(await screen.findByText('Invite New User')).toBeInTheDocument();
  });

  test('Clicking Practitioner segment updates filter', async () => {
    await setup('/admin/users');
    expect(await screen.findByText('All')).toBeInTheDocument();

    await act(async () => {
      // Click the segmented control label specifically
      fireEvent.click(screen.getAllByText('Practitioner')[0]);
    });

    // Segmented control and invite link remain visible
    expect(screen.getAllByText('Practitioner').length).toBeGreaterThan(0);
    expect(screen.getByText('Invite New User')).toBeInTheDocument();
  });

  test('Clicking Patient segment updates filter', async () => {
    await setup('/admin/users');
    expect(await screen.findByText('All')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getAllByText('Patient')[0]);
    });

    expect(screen.getAllByText('Patient').length).toBeGreaterThan(0);
    expect(screen.getByText('Invite New User')).toBeInTheDocument();
  });

  test('Clicking RelatedPerson segment updates filter', async () => {
    await setup('/admin/users');
    expect(await screen.findByText('All')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getAllByText('RelatedPerson')[0]);
    });

    expect(screen.getAllByText('RelatedPerson').length).toBeGreaterThan(0);
    expect(screen.getByText('Invite New User')).toBeInTheDocument();
  });

  test('Clicking All segment after filtering resets to all types', async () => {
    await setup('/admin/users');
    expect(await screen.findByText('All')).toBeInTheDocument();

    // Switch to Patient first
    await act(async () => {
      fireEvent.click(screen.getAllByText('Patient')[0]);
    });

    // Switch back to All
    await act(async () => {
      fireEvent.click(screen.getByText('All'));
    });

    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Invite New User')).toBeInTheDocument();
  });

  test('Clicking a search result row navigates to the ProjectMembership page', async () => {
    await setup('/admin/users');
    expect(await screen.findByText('All')).toBeInTheDocument();

    // Wait for the search results to load and a row to appear
    const rows = await screen.findAllByTestId('search-control-row');
    expect(rows.length).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.click(rows[0]);
    });

    // After clicking a row the router should navigate to /ProjectMembership/<id>
    await waitFor(() => {
      expect(screen.queryByText('Invite New User')).not.toBeInTheDocument();
    });
  });

  test('Bulk actions can reset MFA for selected members', async () => {
    await setup('/admin/users');
    expect(await screen.findByText('All')).toBeInTheDocument();

    // Wait for rows, then select all members via the header checkbox.
    await screen.findAllByTestId('search-control-row');
    await act(async () => {
      fireEvent.click(screen.getByTestId('all-checkbox'));
    });

    // Open the bulk actions modal.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Bulk/ }));
    });

    const dialog = await screen.findByRole('dialog');
    const postSpy = vi.spyOn(medplum, 'post').mockResolvedValue({ resourceType: 'OperationOutcome', issue: [] });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Reset MFA (authenticator)' }));
    });

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalled();
    });
    // TOTP method is used for bulk resets.
    expect(postSpy.mock.calls[0][0]).toMatch(/\/mfa\/reset$/);
    expect(postSpy.mock.calls[0][1]).toEqual({ method: 'totp' });
    postSpy.mockRestore();
  });

  test('Bulk reset MFA pluralizes the summary message for multiple members', async () => {
    await addPractitionerMembership('Extra1');

    const postSpy = vi.spyOn(medplum, 'post').mockResolvedValue({ resourceType: 'OperationOutcome', issue: [] });

    await setup('/admin/users');
    expect(await screen.findByText('All')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getAllByText('Practitioner')[0]);
    });

    const rows = await screen.findAllByTestId('search-control-row');
    expect(rows.length).toBeGreaterThan(1);
    await act(async () => {
      fireEvent.click(screen.getByTestId('all-checkbox'));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Bulk/ }));
    });

    const dialog = await screen.findByRole('dialog');
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Reset MFA (authenticator)' }));
    });

    expect(await screen.findByText(/Reset MFA for \d+ members\./)).toBeInTheDocument();
    postSpy.mockRestore();
  });

  test('Bulk remove does nothing when confirmation is rejected', async () => {
    window.confirm = vi.fn(() => false);
    const deleteSpy = vi.spyOn(medplum, 'delete');

    await setup('/admin/users');
    expect(await screen.findByText('All')).toBeInTheDocument();

    await screen.findAllByTestId('search-control-row');
    // Select a single row so the confirm message uses singular "member" phrasing.
    await act(async () => {
      fireEvent.click(screen.getAllByTestId('row-checkbox')[0]);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Bulk/ }));
    });

    const dialog = await screen.findByRole('dialog');
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Remove from project' }));
    });

    expect(deleteSpy).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    deleteSpy.mockRestore();
  });

  test('Bulk remove reports total failure and refreshes results when confirmed', async () => {
    window.confirm = vi.fn(() => true);
    const invalidateSpy = vi.spyOn(medplum, 'invalidateSearches');
    const deleteSpy = vi.spyOn(medplum, 'delete').mockRejectedValue(new Error('boom'));

    await setup('/admin/users');
    expect(await screen.findByText('All')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getAllByText('Practitioner')[0]);
    });

    await screen.findAllByTestId('search-control-row');
    await act(async () => {
      fireEvent.click(screen.getByTestId('all-checkbox'));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Bulk/ }));
    });

    const dialog = await screen.findByRole('dialog');
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Remove from project' }));
    });

    expect(await screen.findByText(/failed: boom/)).toBeInTheDocument();
    expect(invalidateSpy).toHaveBeenCalledWith('ProjectMembership');
    deleteSpy.mockRestore();
    invalidateSpy.mockRestore();
  });

  test('Bulk remove reports partial failure for multiple members when confirmed', async () => {
    const extra = await addPractitionerMembership('Extra2');

    window.confirm = vi.fn(() => true);
    const deleteSpy = vi
      .spyOn(medplum, 'delete')
      .mockImplementation((url: string | URL) =>
        url.toString().includes(extra.id as string) ? Promise.reject(new Error('boom')) : Promise.resolve(undefined)
      );

    await setup('/admin/users');
    expect(await screen.findByText('All')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getAllByText('Practitioner')[0]);
    });

    const rows = await screen.findAllByTestId('search-control-row');
    expect(rows.length).toBeGreaterThan(1);
    await act(async () => {
      fireEvent.click(screen.getByTestId('all-checkbox'));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Bulk/ }));
    });

    const dialog = await screen.findByRole('dialog');
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Remove from project' }));
    });

    expect(await screen.findByText(/failed: boom/)).toBeInTheDocument();
    deleteSpy.mockRestore();
  });

  // Fresh, isolated client whose Project/123 allows the given MFA methods. Used to
  // avoid cross-test caching of the shared `admin/projects/123` response.
  async function setupMfaClient(allowedMfaMethods: string): Promise<MockClient> {
    const client = new MockClient();
    client.setActiveLoginOverride({
      accessToken: '123',
      refreshToken: '456',
      profile: { reference: 'Practitioner/124' },
      project: { reference: 'Project/123' },
    });
    const project = await client.readResource('Project', '123');
    await client.updateResource({ ...project, setting: [{ name: 'allowedMfaMethods', valueString: allowedMfaMethods }] });
    return client;
  }

  test('Shows MFA enrollment columns reflecting each member\'s enrolled factors', async () => {
    // Project allows both authenticator and email MFA.
    const client = await setupMfaClient('totp,email');
    // The member (User/123) is enrolled in TOTP but not email.
    const batchSpy = vi.spyOn(client, 'executeBatch').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'batch-response',
      entry: [
        { resource: { resourceType: 'User', id: '123', firstName: 'Alice', lastName: 'Smith', mfaMethod: ['totp'] } },
      ],
    });

    renderAppRoutes(client, '/admin/users');
    await screen.findAllByTestId('search-control-row');

    expect(await screen.findByText('Authenticator MFA')).toBeInTheDocument();
    expect(screen.getByText('Email MFA')).toBeInTheDocument();
    expect((await screen.findAllByText('Enrolled')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Not enrolled').length).toBeGreaterThan(0);

    batchSpy.mockRestore();
  });

  test('Omits the Email MFA column when the project does not allow email MFA', async () => {
    const client = await setupMfaClient('totp');
    const batchSpy = vi
      .spyOn(client, 'executeBatch')
      .mockResolvedValue({ resourceType: 'Bundle', type: 'batch-response', entry: [] });

    renderAppRoutes(client, '/admin/users');
    await screen.findAllByTestId('search-control-row');

    expect(await screen.findByText('Authenticator MFA')).toBeInTheDocument();
    expect(screen.queryByText('Email MFA')).not.toBeInTheDocument();

    batchSpy.mockRestore();
  });

  test('Does not show MFA enrollment columns when showMfaEnrollment is not set', async () => {
    const batchSpy = vi.spyOn(medplum, 'executeBatch');
    render(
      <MedplumProvider medplum={medplum}>
        <MemoryRouter>
          <MemberTable profileTypeOptions={[{ label: 'Practitioner', value: 'Practitioner' }]} fields={['user']} />
        </MemoryRouter>
      </MedplumProvider>
    );

    await screen.findAllByTestId('search-control-row');
    expect(screen.queryByText('Authenticator MFA')).not.toBeInTheDocument();
    expect(screen.queryByText('Email MFA')).not.toBeInTheDocument();
    // No member Users are fetched when the columns are disabled.
    expect(batchSpy).not.toHaveBeenCalled();
    batchSpy.mockRestore();
  });

  test('Shows custom toolbar content even without segmented control or toolbarLeft', async () => {
    render(
      <MedplumProvider medplum={medplum}>
        <MemoryRouter>
          <MemberTable
            profileTypeOptions={[{ label: 'Practitioner', value: 'Practitioner' }]}
            fields={['user']}
            toolbarRight={<span>Right note</span>}
          />
        </MemoryRouter>
      </MedplumProvider>
    );

    expect(await screen.findByText('Right note')).toBeInTheDocument();
    // bulkActions is not set, so the bulk "Actions" button should not be present.
    expect(screen.queryByRole('button', { name: /Bulk/ })).not.toBeInTheDocument();
  });
});
