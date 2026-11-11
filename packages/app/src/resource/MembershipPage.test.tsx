// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { forbidden, OperationOutcomeError } from '@medplum/core';
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
    medplum.setActiveLoginOverride({
      accessToken: '123',
      refreshToken: '456',
      profile: { reference: 'Practitioner/123' },
      project: { reference: 'Project/123' },
    });
    return medplum;
  }

  async function createPatientMembership(
    medplum: MockClient,
    userReference: string,
    project: ProjectMembership['project'] = { reference: 'Project/123' }
  ): Promise<Patient> {
    const patient = await medplum.createResource<Patient>({ resourceType: 'Patient', name: [{ given: ['Bob'] }] });
    await medplum.createResource<ProjectMembership>({
      resourceType: 'ProjectMembership',
      project,
      user: { reference: userReference },
      profile: { reference: `Patient/${patient.id}` },
    });
    return patient;
  }

  function mockUserRead(medplum: MockClient, read: () => Promise<never>): void {
    const readReference = medplum.readReference.bind(medplum);
    vi.spyOn(medplum, 'readReference').mockImplementation(((ref: { reference?: string }) =>
      ref.reference?.startsWith('User/') ? read() : readReference(ref as never)) as typeof medplum.readReference);
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

  test('Shows a readable server-scoped user with a note and no email link', async () => {
    const medplum = asAdmin();
    const user = await medplum.createResource<User>({
      resourceType: 'User',
      firstName: 'Bob',
      lastName: 'Jones',
      email: 'bob@example.com',
    });
    const patient = await createPatientMembership(medplum, `User/${user.id}`);

    await setup(`/Patient/${patient.id}/membership`, medplum);

    expect(await screen.findByText('This User is server-scoped.')).toBeInTheDocument();
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Go to User (change login email)' })).not.toBeInTheDocument();
  });

  test('Shows loading while the user is being read', async () => {
    const medplum = asAdmin();
    const patient = await createPatientMembership(medplum, 'User/pending');
    mockUserRead(
      medplum,
      () =>
        new Promise<never>(() => {
          // never resolves
        })
    );

    await setup(`/Patient/${patient.id}/membership`, medplum);

    expect(await screen.findByText('User Details')).toBeInTheDocument();
    expect(document.querySelector('.mantine-Loader-root')).toBeInTheDocument();
    expect(screen.queryByText(/server-scoped/)).not.toBeInTheDocument();
  });

  test('Shows likely server-scoped alert when the user is not found', async () => {
    const medplum = asAdmin();
    const patient = await createPatientMembership(medplum, 'User/missing');

    await setup(`/Patient/${patient.id}/membership`, medplum);

    expect(
      await screen.findByText('This User could not be found in this project. It is likely server-scoped.')
    ).toBeInTheDocument();
  });

  test('Shows the error when the user read fails', async () => {
    const medplum = asAdmin();
    const patient = await createPatientMembership(medplum, 'User/denied');
    mockUserRead(medplum, () => Promise.reject(new OperationOutcomeError(forbidden)));

    await setup(`/Patient/${patient.id}/membership`, medplum);

    expect(await screen.findByText('Forbidden')).toBeInTheDocument();
    expect(screen.queryByText(/server-scoped/)).not.toBeInTheDocument();
  });

  test('Links to the project instead of project admin for other projects', async () => {
    const medplum = asAdmin();
    const patient = await createPatientMembership(medplum, 'Patient/123', {
      reference: 'Project/other',
      display: 'Other Project',
    });

    await setup(`/Patient/${patient.id}/membership`, medplum);

    expect(await screen.findByRole('link', { name: 'Go to Other Project' })).toHaveAttribute('href', '/Project/other');
    expect(screen.queryByRole('link', { name: 'View in project admin' })).not.toBeInTheDocument();
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
