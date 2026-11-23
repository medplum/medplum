// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Project } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { renderAppRoutes, screen, userEvent } from '../test-utils/render';

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
      profile: { reference: `ClientApplication/${client.id}`, display: 'Test Client' },
      admin: true,
    });

    renderAppRoutes(medplum, '/admin/security');

    expect(await screen.findByText('Client "Test Client" has no access policy or IP restriction')).toBeInTheDocument();
    expect(screen.getByText('Client "Test Client" is a project admin')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /^Clients \(/ }));
    expect(await screen.findByText('0 days')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /^Admins \(/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Client "Test Client" is a project admin');
  });
});
