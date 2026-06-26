// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { cleanNotifications } from '@mantine/notifications';
import type { Bot, Practitioner, ProjectMembership, User } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { act, fireEvent, renderAppRoutes, screen, waitFor } from '../test-utils/render';

describe('MemberDetailsPage', () => {
  function createMedplum(admin = false): MockClient {
    const medplum = new MockClient();
    medplum.setActiveLoginOverride({
      accessToken: '123',
      refreshToken: '456',
      profile: { reference: 'Practitioner/124' },
      project: { reference: 'Project/123' },
    });
    medplum.getProjectMembership = () => ({ admin }) as ProjectMembership;
    return medplum;
  }

  afterEach(() => {
    act(() => {
      cleanNotifications();
    });
  });

  test('Shows User Details with Go to User link for project-scoped user', async () => {
    const medplum = createMedplum();

    const practitioner = await medplum.createResource<Practitioner>({
      resourceType: 'Practitioner',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    const user = await medplum.createResource<User>({
      resourceType: 'User',
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'alice@example.com',
      project: { reference: 'Project/123' },
    });

    const membership = await medplum.createResource<ProjectMembership>({
      resourceType: 'ProjectMembership',
      project: { reference: 'Project/123' },
      user: { reference: `User/${user.id}` },
      profile: { reference: `Practitioner/${practitioner.id}` },
    });

    renderAppRoutes(medplum, `/admin/users/${membership.id}`);

    expect(await screen.findByText('User Details')).toBeInTheDocument();
    expect(screen.getByText('Go to User (change login email)')).toBeInTheDocument();
  });

  test('Shows server-scoped alert for server-scoped user', async () => {
    const medplum = createMedplum();

    const practitioner = await medplum.createResource<Practitioner>({
      resourceType: 'Practitioner',
      name: [{ given: ['Bob'], family: 'Jones' }],
    });

    const user = await medplum.createResource<User>({
      resourceType: 'User',
      firstName: 'Bob',
      lastName: 'Jones',
      email: 'bob@example.com',
    });

    const membership = await medplum.createResource<ProjectMembership>({
      resourceType: 'ProjectMembership',
      project: { reference: 'Project/123' },
      user: { reference: `User/${user.id}` },
      profile: { reference: `Practitioner/${practitioner.id}` },
    });

    renderAppRoutes(medplum, `/admin/users/${membership.id}`);

    expect(await screen.findByText('User Details')).toBeInTheDocument();
    expect(screen.getByText('This User is server-scoped and cannot be viewed in this project.')).toBeInTheDocument();
  });

  test('Does not show User Details for Bot membership', async () => {
    const medplum = createMedplum();

    const bot = await medplum.createResource<Bot>({
      resourceType: 'Bot',
      name: 'Test Bot',
    });

    const membership = await medplum.createResource<ProjectMembership>({
      resourceType: 'ProjectMembership',
      project: { reference: 'Project/123' },
      user: { reference: `Bot/${bot.id}` },
      profile: { reference: `Bot/${bot.id}` },
    });

    renderAppRoutes(medplum, `/admin/bots/${membership.id}`);

    expect(await screen.findByText('ProjectMembership Details')).toBeInTheDocument();
    expect(screen.queryByText('User Details')).not.toBeInTheDocument();
  });

  test('Shows membership and profile details', async () => {
    const medplum = createMedplum();

    const practitioner = await medplum.createResource<Practitioner>({
      resourceType: 'Practitioner',
      name: [{ given: ['Carol'], family: 'Davis' }],
    });

    const user = await medplum.createResource<User>({
      resourceType: 'User',
      firstName: 'Carol',
      lastName: 'Davis',
      email: 'carol@example.com',
      project: { reference: 'Project/123' },
    });

    const membership = await medplum.createResource<ProjectMembership>({
      resourceType: 'ProjectMembership',
      project: { reference: 'Project/123' },
      user: { reference: `User/${user.id}` },
      profile: { reference: `Practitioner/${practitioner.id}` },
    });

    renderAppRoutes(medplum, `/admin/users/${membership.id}`);

    expect(await screen.findByText('ProjectMembership Details')).toBeInTheDocument();
    expect(screen.getByText('Go to ProjectMembership')).toBeInTheDocument();
    expect(screen.getByText('Profile Details')).toBeInTheDocument();
    expect(screen.getByText('Go to Practitioner')).toBeInTheDocument();
  });

  test('Shows Remove user button for project admins', async () => {
    const medplum = createMedplum(true);

    const practitioner = await medplum.createResource<Practitioner>({
      resourceType: 'Practitioner',
      name: [{ given: ['Dana'], family: 'Lee' }],
    });

    const user = await medplum.createResource<User>({
      resourceType: 'User',
      firstName: 'Dana',
      lastName: 'Lee',
      email: 'dana@example.com',
      project: { reference: 'Project/123' },
    });

    const membership = await medplum.createResource<ProjectMembership>({
      resourceType: 'ProjectMembership',
      project: { reference: 'Project/123' },
      user: { reference: `User/${user.id}` },
      profile: { reference: `Practitioner/${practitioner.id}` },
    });

    renderAppRoutes(medplum, `/admin/users/${membership.id}`);

    expect(await screen.findByText('Remove user')).toBeInTheDocument();
  });

  test('Hides Remove user button for non-admins', async () => {
    const medplum = createMedplum(false);

    const practitioner = await medplum.createResource<Practitioner>({
      resourceType: 'Practitioner',
      name: [{ given: ['Evan'], family: 'Park' }],
    });

    const user = await medplum.createResource<User>({
      resourceType: 'User',
      firstName: 'Evan',
      lastName: 'Park',
      email: 'evan@example.com',
      project: { reference: 'Project/123' },
    });

    const membership = await medplum.createResource<ProjectMembership>({
      resourceType: 'ProjectMembership',
      project: { reference: 'Project/123' },
      user: { reference: `User/${user.id}` },
      profile: { reference: `Practitioner/${practitioner.id}` },
    });

    renderAppRoutes(medplum, `/admin/users/${membership.id}`);

    expect(await screen.findByText('ProjectMembership Details')).toBeInTheDocument();
    expect(screen.queryByText('Remove user')).not.toBeInTheDocument();
  });

  test('Remove user navigates back to users list when confirmed', async () => {
    const medplum = createMedplum(true);
    const deleteSpy = vi.spyOn(medplum, 'delete').mockResolvedValue(undefined);

    const practitioner = await medplum.createResource<Practitioner>({
      resourceType: 'Practitioner',
      name: [{ given: ['Fran'], family: 'Nguyen' }],
    });

    const user = await medplum.createResource<User>({
      resourceType: 'User',
      firstName: 'Fran',
      lastName: 'Nguyen',
      email: 'fran@example.com',
      project: { reference: 'Project/123' },
    });

    const membership = await medplum.createResource<ProjectMembership>({
      resourceType: 'ProjectMembership',
      project: { reference: 'Project/123' },
      user: { reference: `User/${user.id}` },
      profile: { reference: `Practitioner/${practitioner.id}` },
    });

    renderAppRoutes(medplum, `/admin/users/${membership.id}`);

    expect(await screen.findByText('Remove user')).toBeInTheDocument();

    window.confirm = vi.fn(() => true);

    await act(async () => {
      fireEvent.click(screen.getByText('Remove user'));
    });

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith(`admin/projects/123/members/${membership.id}`);
    });

    expect(await screen.findByText('Invite New User')).toBeInTheDocument();
  });

  test('Remove user does nothing when confirm is rejected', async () => {
    const medplum = createMedplum(true);
    const deleteSpy = vi.spyOn(medplum, 'delete').mockResolvedValue(undefined);

    const practitioner = await medplum.createResource<Practitioner>({
      resourceType: 'Practitioner',
      name: [{ given: ['Gina'], family: 'Ross' }],
    });

    const user = await medplum.createResource<User>({
      resourceType: 'User',
      firstName: 'Gina',
      lastName: 'Ross',
      email: 'gina@example.com',
      project: { reference: 'Project/123' },
    });

    const membership = await medplum.createResource<ProjectMembership>({
      resourceType: 'ProjectMembership',
      project: { reference: 'Project/123' },
      user: { reference: `User/${user.id}` },
      profile: { reference: `Practitioner/${practitioner.id}` },
    });

    renderAppRoutes(medplum, `/admin/users/${membership.id}`);

    expect(await screen.findByText('Remove user')).toBeInTheDocument();

    window.confirm = vi.fn(() => false);

    await act(async () => {
      fireEvent.click(screen.getByText('Remove user'));
    });

    expect(deleteSpy).not.toHaveBeenCalled();
    expect(screen.getByText('ProjectMembership Details')).toBeInTheDocument();
  });
});
