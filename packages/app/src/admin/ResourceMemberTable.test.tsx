// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { renderAppRoutes, screen } from '../test-utils/render';

const medplum = new MockClient();

async function setup(url: string): Promise<void> {
  renderAppRoutes(medplum, url);
}

describe('ResourceMemberTable', () => {
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

  test('Renders on Clients page with ClientApplication resourceType', async () => {
    await setup('/admin/clients');
    // Page title and create link confirm ResourceMemberTable rendered without crashing
    expect(await screen.findByText('ClientApps')).toBeInTheDocument();
    expect(screen.getByText('Create new client')).toBeInTheDocument();
  });

  test('Does not render segmented control on Clients page', async () => {
    await setup('/admin/clients');
    await screen.findByText('ClientApps');
    // The segmented profile-type filter only appears on the Users page
    expect(screen.queryByText('All')).not.toBeInTheDocument();
    expect(screen.queryByText('RelatedPerson')).not.toBeInTheDocument();
  });

  test('Renders on Bots page with Bot resourceType', async () => {
    await setup('/admin/bots');
    expect(await screen.findByRole('heading', { name: 'Bots' })).toBeInTheDocument();
    expect(screen.getByText('Create new bot')).toBeInTheDocument();
  });

  test('Does not render segmented control on Bots page', async () => {
    await setup('/admin/bots');
    await screen.findByRole('heading', { name: 'Bots' });
    // The segmented profile-type filter only appears on the Users page
    expect(screen.queryByText('All')).not.toBeInTheDocument();
    expect(screen.queryByText('RelatedPerson')).not.toBeInTheDocument();
  });
});
