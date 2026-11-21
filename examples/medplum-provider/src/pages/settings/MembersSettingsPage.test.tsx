// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference } from '@medplum/core';
import type { ProjectMembership } from '@medplum/fhirtypes';
import { DrAliceSmith, MockClient, TestProject } from '@medplum/mock';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { screen, userEvent, waitFor } from '../../test-utils/render';
import { MembersSettingsPage } from './MembersSettingsPage';
import { renderSettingsPage } from './settingsTestUtils';

const membership: ProjectMembership = {
  resourceType: 'ProjectMembership',
  id: 'membership-alice',
  project: createReference(TestProject as any),
  user: { reference: 'User/alice' },
  profile: createReference(DrAliceSmith),
  admin: true,
};

describe('MembersSettingsPage', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.spyOn(medplum, 'isProjectAdmin').mockReturnValue(true);
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([membership] as any);
  });

  test('tells non-admins they cannot manage members', async () => {
    vi.spyOn(medplum, 'isProjectAdmin').mockReturnValue(false);
    await renderSettingsPage(medplum, <MembersSettingsPage />);
    expect(screen.getByText('Only project admins can view and invite members.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Invite member' })).not.toBeInTheDocument();
  });

  test('lists members with their role', async () => {
    await renderSettingsPage(medplum, <MembersSettingsPage />);
    expect(await screen.findByText('1 members')).toBeInTheDocument();
    expect(await screen.findByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  test('invites a practitioner', async () => {
    const user = userEvent.setup();
    const invite = vi.spyOn(medplum, 'invite').mockResolvedValue(membership);
    await renderSettingsPage(medplum, <MembersSettingsPage />);

    await user.click(screen.getByRole('button', { name: 'Invite member' }));
    await user.type(await screen.findByLabelText(/First name/), 'Bob');
    await user.type(screen.getByLabelText(/Last name/), 'Jones');
    await user.type(screen.getByLabelText(/Email/), 'bob@example.com');
    await user.click(screen.getByLabelText('Project admin'));
    await user.click(screen.getByRole('button', { name: 'Send invite' }));

    await waitFor(() => expect(invite).toHaveBeenCalled());
    expect(invite).toHaveBeenCalledWith(TestProject.id, {
      resourceType: 'Practitioner',
      firstName: 'Bob',
      lastName: 'Jones',
      email: 'bob@example.com',
      sendEmail: true,
      admin: true,
    });
    expect(await screen.findByText('Invited Bob Jones')).toBeInTheDocument();
  });

  test('warns when the invite email could not be sent', async () => {
    const user = userEvent.setup();
    vi.spyOn(medplum, 'invite').mockResolvedValue({ resourceType: 'OperationOutcome', issue: [] });
    await renderSettingsPage(medplum, <MembersSettingsPage />);

    await user.click(screen.getByRole('button', { name: 'Invite member' }));
    await user.type(await screen.findByLabelText(/First name/), 'Bob');
    await user.type(screen.getByLabelText(/Last name/), 'Jones');
    await user.type(screen.getByLabelText(/Email/), 'bob@example.com');
    await user.click(screen.getByRole('button', { name: 'Send invite' }));

    expect(await screen.findByText('Member created, but the invite email could not be sent')).toBeInTheDocument();
  });

  test('shows invite errors in the form', async () => {
    const user = userEvent.setup();
    vi.spyOn(medplum, 'invite').mockRejectedValue(new Error('Email already in use'));
    await renderSettingsPage(medplum, <MembersSettingsPage />);

    await user.click(screen.getByRole('button', { name: 'Invite member' }));
    await user.type(await screen.findByLabelText(/First name/), 'Bob');
    await user.type(screen.getByLabelText(/Last name/), 'Jones');
    await user.type(screen.getByLabelText(/Email/), 'bob@example.com');
    await user.click(screen.getByRole('button', { name: 'Send invite' }));

    expect(await screen.findByText('Email already in use')).toBeInTheDocument();
  });
});
