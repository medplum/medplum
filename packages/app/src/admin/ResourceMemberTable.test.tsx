// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, renderAppRoutes, screen } from '../test-utils/render';
import { ResourceMemberTable } from './ResourceMemberTable';

const medplum = new MockClient();

async function setup(url: string): Promise<void> {
  renderAppRoutes(medplum, url);
}

async function setupDirect(): Promise<void> {
  await act(async () => {
    render(
      <MedplumProvider medplum={medplum}>
        <MemoryRouter>
          <MantineProvider>
            <ResourceMemberTable fields={['user', 'profile', 'profile-type']} />
          </MantineProvider>
        </MemoryRouter>
      </MedplumProvider>
    );
  });
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
    expect(
      await screen.findByRole('heading', { name: 'ProjectMemberships for ClientApplications' })
    ).toBeInTheDocument();
    expect(screen.getByText('Create new client')).toBeInTheDocument();
  });

  test('Does not render segmented control on Clients page', async () => {
    await setup('/admin/clients');
    await screen.findByRole('heading', { name: 'ProjectMemberships for ClientApplications' });
    // The segmented profile-type filter only appears on the Users page
    expect(screen.queryByText('All')).not.toBeInTheDocument();
    expect(screen.queryByText('RelatedPerson')).not.toBeInTheDocument();
  });

  test('Renders on Bots page with Bot resourceType', async () => {
    await setup('/admin/bots');
    expect(await screen.findByRole('heading', { name: 'ProjectMemberships for Bots' })).toBeInTheDocument();
    expect(screen.getByText('Create new bot')).toBeInTheDocument();
  });

  test('Does not render segmented control on Bots page', async () => {
    await setup('/admin/bots');
    await screen.findByRole('heading', { name: 'ProjectMemberships for Bots' });
    // The segmented profile-type filter only appears on the Users page
    expect(screen.queryByText('All')).not.toBeInTheDocument();
    expect(screen.queryByText('RelatedPerson')).not.toBeInTheDocument();
  });

  test('Renders with no resourceType and defaults to all profile types', async () => {
    // Exercises the `?? 'Patient,Practitioner,RelatedPerson'` fallback branch (line 27)
    await setupDirect();
    // The seeded TestProjectMembership (Practitioner profile) should appear in results
    const rows = await screen.findAllByTestId('search-control-row');
    expect(rows.length).toBeGreaterThan(0);
  });

  test('Clicking a search result row triggers the onClick navigation handler', async () => {
    // Exercises the onClick handler on ResourceMemberTable (lines 41-42)
    await setupDirect();
    const rows = await screen.findAllByTestId('search-control-row');
    expect(rows.length).toBeGreaterThan(0);

    // Clicking a row should not throw; navigation is a no-op in MemoryRouter here
    await act(async () => {
      fireEvent.click(rows[0]);
    });

    // Row is still present (MemoryRouter doesn't navigate away in this direct render)
    expect(screen.getAllByTestId('search-control-row').length).toBeGreaterThan(0);
  });
});
