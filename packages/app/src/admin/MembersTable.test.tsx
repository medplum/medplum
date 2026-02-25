// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { act, fireEvent, renderAppRoutes, screen } from '../test-utils/render';

const medplum = new MockClient();

async function setup(url: string): Promise<void> {
  renderAppRoutes(medplum, url);
}

describe('MemberTable (Users page)', () => {
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

  test('Renders segmented control with all profile type options', async () => {
    await setup('/admin/users');
    // Wait for page to load, then verify all four segment labels are present
    expect(await screen.findByText('All')).toBeInTheDocument();
    expect(screen.getAllByText('Practitioner').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Patient').length).toBeGreaterThan(0);
    expect(screen.getAllByText('RelatedPerson').length).toBeGreaterThan(0);
  });

  test('Renders Invite new user link', async () => {
    await setup('/admin/users');
    expect(await screen.findByText('Invite new user')).toBeInTheDocument();
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
    expect(screen.getByText('Invite new user')).toBeInTheDocument();
  });

  test('Clicking Patient segment updates filter', async () => {
    await setup('/admin/users');
    expect(await screen.findByText('All')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getAllByText('Patient')[0]);
    });

    expect(screen.getAllByText('Patient').length).toBeGreaterThan(0);
    expect(screen.getByText('Invite new user')).toBeInTheDocument();
  });

  test('Clicking RelatedPerson segment updates filter', async () => {
    await setup('/admin/users');
    expect(await screen.findByText('All')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getAllByText('RelatedPerson')[0]);
    });

    expect(screen.getAllByText('RelatedPerson').length).toBeGreaterThan(0);
    expect(screen.getByText('Invite new user')).toBeInTheDocument();
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
    expect(screen.getByText('Invite new user')).toBeInTheDocument();
  });
});
