// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type {
  Bot,
  ClientApplication,
  Patient,
  Practitioner,
  ProjectMembership,
  RelatedPerson,
  User,
} from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { act, renderAppRoutes, screen } from '../test-utils/render';

describe('MembershipPage', () => {
  async function setup(url: string, medplum = new MockClient()): Promise<MockClient> {
    await act(async () => {
      renderAppRoutes(medplum, url);
    });
    return medplum;
  }

  function asAdmin(medplum = new MockClient()): MockClient {
    vi.spyOn(medplum, 'isProjectAdmin').mockReturnValue(true);
    return medplum;
  }

  test.each(['Bot', 'ClientApplication', 'Patient', 'Practitioner', 'RelatedPerson'] as const)(
    'Membership tab appears for project admins on %s',
    async (resourceType) => {
      const medplum = asAdmin();
      const resource = await createProfile(medplum, resourceType);
      await setup(`/${resourceType}/${resource.id}`, medplum);
      expect(await screen.findByRole('tab', { name: 'Membership' })).toBeInTheDocument();
    }
  );

  test('Membership tab appears for super admins', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'isSuperAdmin').mockReturnValue(true);
    await setup('/Patient/123', medplum);
    expect(await screen.findByRole('tab', { name: 'Membership' })).toBeInTheDocument();
  });

  test('Membership tab is hidden for non-admins', async () => {
    await setup('/Patient/123');
    expect(await screen.findByRole('tab', { name: 'Timeline' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Membership' })).not.toBeInTheDocument();
  });

  test('Membership tab is hidden for other resource types', async () => {
    const medplum = asAdmin();
    await setup('/Encounter/123', medplum);
    expect(await screen.findByRole('tab', { name: 'Timeline' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Membership' })).not.toBeInTheDocument();
  });

  test('Shows membership and project-scoped user', async () => {
    const medplum = asAdmin();
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

    await setup(`/Practitioner/${practitioner.id}/membership`, medplum);

    expect(await screen.findByText('ProjectMembership Details')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to ProjectMembership' })).toHaveAttribute(
      'href',
      `/ProjectMembership/${membership.id}`
    );
    expect(screen.getByRole('link', { name: 'View in project admin' })).toHaveAttribute(
      'href',
      `/admin/users/${membership.id}`
    );
    expect(await screen.findByText('User Details')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to User (change login email)' })).toHaveAttribute(
      'href',
      `/User/${user.id}/email`
    );
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
  });

  test('Shows server-scoped user alert', async () => {
    const medplum = asAdmin();
    const patient = await medplum.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Bob'], family: 'Jones' }],
    });
    const user = await medplum.createResource<User>({
      resourceType: 'User',
      firstName: 'Bob',
      lastName: 'Jones',
      email: 'bob@example.com',
    });
    await medplum.createResource<ProjectMembership>({
      resourceType: 'ProjectMembership',
      project: { reference: 'Project/123' },
      user: { reference: `User/${user.id}` },
      profile: { reference: `Patient/${patient.id}` },
    });

    await setup(`/Patient/${patient.id}/membership`, medplum);

    expect(await screen.findByText('User Details')).toBeInTheDocument();
    expect(screen.getByText('This User is server-scoped and cannot be viewed in this project.')).toBeInTheDocument();
  });

  test('Bot membership links to the bots admin page and hides User details', async () => {
    const medplum = asAdmin();
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

    await setup(`/Bot/${bot.id}/membership`, medplum);

    expect(await screen.findByText('ProjectMembership Details')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View in project admin' })).toHaveAttribute(
      'href',
      `/admin/bots/${membership.id}`
    );
    expect(screen.queryByText('User Details')).not.toBeInTheDocument();
  });

  test('Client membership links to the clients admin page', async () => {
    const medplum = asAdmin();
    const client = await medplum.createResource<ClientApplication>({
      resourceType: 'ClientApplication',
      name: 'Test Client',
    });
    const membership = await medplum.createResource<ProjectMembership>({
      resourceType: 'ProjectMembership',
      project: { reference: 'Project/123' },
      user: { reference: `ClientApplication/${client.id}` },
      profile: { reference: `ClientApplication/${client.id}` },
    });

    await setup(`/ClientApplication/${client.id}/membership`, medplum);

    expect(await screen.findByRole('link', { name: 'View in project admin' })).toHaveAttribute(
      'href',
      `/admin/clients/${membership.id}`
    );
    expect(screen.queryByText('User Details')).not.toBeInTheDocument();
  });

  test('Shows an empty state when nothing is linked', async () => {
    const medplum = asAdmin();
    const practitioner = await medplum.createResource<Practitioner>({
      resourceType: 'Practitioner',
      name: [{ given: ['Dana'], family: 'Lee' }],
    });

    await setup(`/Practitioner/${practitioner.id}/membership`, medplum);

    expect(await screen.findByText('This resource does not have a ProjectMembership.')).toBeInTheDocument();
  });

  test('Direct visit requires admin access', async () => {
    const medplum = new MockClient();
    const practitioner = await medplum.createResource<Practitioner>({
      resourceType: 'Practitioner',
    });

    await setup(`/Practitioner/${practitioner.id}/membership`, medplum);

    expect(await screen.findByText('Admin access required')).toBeInTheDocument();
  });
});

async function createProfile(
  medplum: MockClient,
  resourceType: 'Bot' | 'ClientApplication' | 'Patient' | 'Practitioner' | 'RelatedPerson'
): Promise<{ id: string }> {
  if (resourceType === 'Bot') {
    return medplum.createResource<Bot>({ resourceType: 'Bot', name: 'Tab Bot' });
  }
  if (resourceType === 'ClientApplication') {
    return medplum.createResource<ClientApplication>({ resourceType: 'ClientApplication', name: 'Tab Client' });
  }
  if (resourceType === 'Patient') {
    return medplum.createResource<Patient>({ resourceType: 'Patient', name: [{ given: ['Pat'] }] });
  }
  if (resourceType === 'Practitioner') {
    return medplum.createResource<Practitioner>({ resourceType: 'Practitioner', name: [{ given: ['Pat'] }] });
  }
  return medplum.createResource<RelatedPerson>({
    resourceType: 'RelatedPerson',
    patient: { reference: 'Patient/123' },
    name: [{ given: ['Pat'] }],
  });
}
