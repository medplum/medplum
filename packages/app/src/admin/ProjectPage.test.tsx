// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { act, fireEvent, renderAppRoutes, screen } from '../test-utils/render';

const medplum = new MockClient();

async function setup(url: string): Promise<void> {
  renderAppRoutes(medplum, url);
}

describe('ProjectPage', () => {
  beforeAll(() => {
    medplum.setActiveLoginOverride({
      accessToken: '123',
      refreshToken: '456',
      profile: {
        reference: 'Practitioner/123',
      },
      project: {
        reference: 'Project/123',
      },
    });
  });

  test('Renders', async () => {
    await setup('/admin/details');
    expect(await screen.findAllByText('Project 123')).toHaveLength(2);
  });

  test('Backwards compat', async () => {
    await setup('/admin/project');
    expect(await screen.findAllByText('Project 123')).toHaveLength(2);
  });

  test('Tab change', async () => {
    await setup('/admin/details');
    expect(await screen.findByText('Users')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Users'));
    });

    expect(screen.getByText('Invite New User')).toBeInTheDocument();
  });

  test('Users page', async () => {
    await setup('/admin/users');
    expect(await screen.findByText('Invite New User')).toBeInTheDocument();
  });

  test('Users page shows profile type segmented control', async () => {
    await setup('/admin/users');
    expect(await screen.findByText('All')).toBeInTheDocument();
    expect(screen.getAllByText('Practitioner').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Patient').length).toBeGreaterThan(0);
    expect(screen.getAllByText('RelatedPerson').length).toBeGreaterThan(0);
  });

  test('Users page segmented control filters by Practitioner', async () => {
    await setup('/admin/users');
    expect(await screen.findByText('All')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getAllByText('Practitioner')[0]);
    });

    expect(screen.getAllByText('Practitioner').length).toBeGreaterThan(0);
    expect(screen.getByText('Invite New User')).toBeInTheDocument();
  });

  test('Clients page does not show profile type segmented control', async () => {
    await setup('/admin/clients');
    await screen.findByText('Create new client');
    expect(screen.queryByText('RelatedPerson')).not.toBeInTheDocument();
  });

  test('Bots page does not show profile type segmented control', async () => {
    await setup('/admin/bots');
    await screen.findByText('Create new bot');
    expect(screen.queryByText('RelatedPerson')).not.toBeInTheDocument();
  });

  test('Clients page', async () => {
    await setup('/admin/clients');
    expect(await screen.findByText('Create new client')).toBeInTheDocument();
  });

  test('Bots page', async () => {
    await setup('/admin/bots');
    expect(await screen.findByText('Create new bot')).toBeInTheDocument();
  });
});
