// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference, ReadablePromise } from '@medplum/core';
import type {
  AccessPolicy,
  Bundle,
  ClientApplication,
  DocumentReference,
  Project,
  ProjectMembership,
} from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { renderAppRoutes, screen, userEvent, waitFor } from '../test-utils/render';

async function setup(): Promise<{ medplum: MockClient; project: WithId<Project> }> {
  const medplum = new MockClient({ seedDefaultData: false });
  const project = await medplum.updateResource<Project>({ resourceType: 'Project', id: 'p123', name: 'Test Project' });
  medplum.setActiveLoginOverride({
    accessToken: '123',
    refreshToken: '456',
    profile: { reference: 'Practitioner/123' },
    project: { reference: `Project/${project.id}` },
  });
  return { medplum, project };
}

describe('SecurityHealthCheckPage', () => {
  test('passes a project with nothing to flag', async () => {
    const { medplum } = await setup();
    renderAppRoutes(medplum, '/admin/security');
    expect(await screen.findByText('No issues found')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /^Clients \(/ }));
    expect(await screen.findByText('This project has no client applications.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /^Admins \(/ }));
    expect(await screen.findByText('No members have admin privileges.')).toBeInTheDocument();
  });

  test('flags a client admin with no access policy', async () => {
    const { medplum, project } = await setup();
    const client = await medplum.createResource({
      resourceType: 'ClientApplication',
      name: 'Test Client',
      secret: 'abc',
    });
    await medplum.createResource({
      resourceType: 'ProjectMembership',
      project: { reference: `Project/${project.id}` },
      user: { reference: `ClientApplication/${client.id}` },
      profile: { reference: `ClientApplication/${client.id}`, display: 'Stale Name' },
      admin: true,
    });

    renderAppRoutes(medplum, '/admin/security');

    const title = 'Client "Test Client" is a project admin with no access policy';
    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(screen.getByText('Critical (1)')).toBeInTheDocument();

    await userEvent.click(screen.getByText('High (0)'));
    expect(screen.queryByText(title)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /^Clients \(/ }));
    expect(await screen.findByText('0 days')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /^Admins \(/ }));
    expect(await screen.findByRole('alert', { name: title })).toBeInTheDocument();
  });

  test('saves a report after each run', async () => {
    const { medplum } = await setup();
    renderAppRoutes(medplum, '/admin/security');
    expect(await screen.findByText('No issues found')).toBeInTheDocument();

    const doc = (await waitFor(async () => {
      const result = await medplum.searchOne('DocumentReference');
      expect(result).toBeDefined();
      return result;
    })) as DocumentReference;
    expect(doc.type).toEqual({
      coding: [{ system: 'https://medplum.com/fhir/CodeSystem/document-type', code: 'security-health-check' }],
      text: 'Security health check report',
    });
    const binaryId = doc.content[0].attachment.url?.split('/').pop() as string;
    const binary = await medplum.readResource('Binary', binaryId);
    expect(binary).toMatchObject({ contentType: 'application/json', securityContext: { reference: 'Project/p123' } });
  });

  test('opens the last saved report without running a new check', async () => {
    const { medplum } = await setup();
    await medplum.createResource<DocumentReference>({
      resourceType: 'DocumentReference',
      status: 'current',
      type: {
        coding: [{ system: 'https://medplum.com/fhir/CodeSystem/document-type', code: 'security-health-check' }],
      },
      date: '2026-11-01T00:00:00.000Z',
      content: [{ attachment: { url: 'https://example.com/binary/report', contentType: 'application/json' } }],
    });
    const report = {
      checkedAt: '2026-11-01T00:00:00.000Z',
      findings: [{ id: 'f1', severity: 'high', title: 'Saved finding', description: 'From the saved report' }],
      clients: [],
      admins: [],
    };
    vi.spyOn(medplum, 'download').mockResolvedValue(new Blob([JSON.stringify(report)]));
    const search = vi.spyOn(medplum, 'searchResourcePages');

    renderAppRoutes(medplum, '/admin/security');
    expect(await screen.findByText('Saved finding')).toBeInTheDocument();
    expect(screen.getByText(/^Last checked/)).toBeInTheDocument();
    expect(search).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Run again' }));
    expect(await screen.findByText('No issues found')).toBeInTheDocument();
    expect(search).toHaveBeenCalled();
  });

  test('lists clients and admins', async () => {
    const { medplum, project } = await setup();
    await medplum.updateResource<Project>({ ...project, owner: { reference: 'User/u1' } });
    await medplum.updateResource({
      resourceType: 'User',
      id: 'u1',
      firstName: 'Olive',
      lastName: 'Owner',
      email: 'olive@example.org',
    });
    const policy = await medplum.createResource<AccessPolicy>({
      resourceType: 'AccessPolicy',
      resource: [{ resourceType: 'Patient' }],
      ipAccessRule: [{ value: '*', action: 'block' }],
    });
    const membership = (rest: Partial<ProjectMembership> & Pick<ProjectMembership, 'profile'>): ProjectMembership => ({
      resourceType: 'ProjectMembership',
      project: { reference: `Project/${project.id}` },
      user: { reference: rest.profile.reference },
      ...rest,
    });
    await medplum.createResource(
      membership({
        user: { reference: 'User/u1' },
        profile: { reference: 'Practitioner/pr1' },
        accessPolicy: createReference(policy),
        admin: true,
      })
    );
    await medplum.createResource(membership({ profile: { reference: 'Bot/b1' }, admin: true, active: false }));
    await medplum.createResource(
      membership({
        profile: { reference: 'ClientApplication/c1' },
        accessPolicy: createReference(policy),
      })
    );
    await medplum.createResource(
      membership({
        profile: { reference: 'ClientApplication/c2' },
        accessPolicy: { reference: 'AccessPolicy/linked' },
        active: false,
      })
    );

    renderAppRoutes(medplum, '/admin/security');
    expect(await screen.findByText('No issues found')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /^Clients \(/ }));
    expect(await screen.findByText('ClientApplication/c1')).toBeInTheDocument();
    expect(screen.getByText('ClientApplication/c2')).toBeInTheDocument();
    expect(screen.getAllByText('Unknown')).toHaveLength(4);

    await userEvent.click(screen.getByRole('tab', { name: /^Admins \(/ }));
    expect(await screen.findByText('Owner')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  test('shows the oldest known secret age when history is cut short', async () => {
    const { medplum, project } = await setup();
    const client = await medplum.createResource<ClientApplication>({
      resourceType: 'ClientApplication',
      name: 'Old Client',
      secret: 'abc',
    });
    await medplum.createResource<ProjectMembership>({
      resourceType: 'ProjectMembership',
      project: { reference: `Project/${project.id}` },
      user: createReference(client),
      profile: createReference(client),
    });
    const lastUpdated = new Date(Date.now() - 200 * 86_400_000).toISOString();
    const page: Bundle<ClientApplication> = {
      resourceType: 'Bundle',
      type: 'history',
      entry: Array.from({ length: 100 }, () => ({ resource: { ...client, meta: { lastUpdated } } })),
    };
    vi.spyOn(medplum, 'readHistory')
      .mockReturnValueOnce(new ReadablePromise(Promise.resolve(page)) as never)
      .mockImplementationOnce(() => new ReadablePromise(Promise.reject(new Error('Too deep'))));

    renderAppRoutes(medplum, '/admin/security');
    expect(
      await screen.findByText('Client "Old Client" secret has not been rotated in at least 200 days')
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /^Clients \(/ }));
    expect(await screen.findByText('At least 200 days')).toBeInTheDocument();
  });

  test('shows an error and runs again', async () => {
    const { medplum } = await setup();
    const search = vi.spyOn(medplum, 'searchResourcePages').mockImplementationOnce(() => {
      throw new Error('Search failed');
    });

    renderAppRoutes(medplum, '/admin/security');
    expect(await screen.findByText('Search failed')).toBeInTheDocument();

    search.mockRestore();
    await userEvent.click(screen.getByRole('button', { name: 'Run again' }));
    expect(await screen.findByText('No issues found')).toBeInTheDocument();
    expect(screen.queryByText('Search failed')).not.toBeInTheDocument();
  });
});
