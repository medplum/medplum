// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import type { User } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { act, render, screen, waitFor } from '../test-utils/render';
import { MemberDetailsPage } from './MemberDetailsPage';

describe('MemberDetailsPage', () => {
  let medplum: MockClient;

  function setup(): void {
    medplum.setActiveLoginOverride({
      accessToken: '123',
      refreshToken: '456',
      profile: { reference: 'Practitioner/123' },
      project: { reference: 'Project/123' },
    });
    render(
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={['/admin/users/456']} initialIndex={0}>
          <MantineProvider env="test">
            <Notifications />
            <Routes>
              <Route path="/admin/users/:membershipId" element={<MemberDetailsPage />} />
            </Routes>
          </MantineProvider>
        </MemoryRouter>
      </MedplumProvider>
    );
  }

  beforeEach(() => {
    medplum = new MockClient();
  });

  afterEach(async () => {
    await act(async () => notifications.clean());
    jest.clearAllMocks();
  });

  test('renders ProjectMembership and User details for project-scoped user', async () => {
    jest.spyOn(medplum, 'isProjectAdmin').mockImplementation(() => true);
    jest.spyOn(medplum, 'readResource').mockImplementation(((resourceType: string, id: string) => {
      if (resourceType === 'User' && id === '123') {
        return Promise.resolve({ resourceType: 'User', id: '123', meta: { project: '123' } } as User);
      }
      return MockClient.prototype.readResource.call(medplum, resourceType as any, id);
    }) as any);

    setup();

    expect(await screen.findByText('ProjectMembership Details')).toBeInTheDocument();
    expect(await screen.findByText('User Details')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Project', { selector: '.mantine-Badge-label' })).toBeInTheDocument());
    expect(await screen.findByRole('button', { name: 'Release User' })).toBeInTheDocument();
  });

  test('hides Release widget for non-project-admin', async () => {
    jest.spyOn(medplum, 'isProjectAdmin').mockImplementation(() => false);
    jest.spyOn(medplum, 'readResource').mockImplementation(((resourceType: string, id: string) => {
      if (resourceType === 'User' && id === '123') {
        return Promise.resolve({ resourceType: 'User', id: '123', meta: { project: '123' } } as User);
      }
      return MockClient.prototype.readResource.call(medplum, resourceType as any, id);
    }) as any);

    setup();

    await waitFor(() => expect(screen.getByText('Project', { selector: '.mantine-Badge-label' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Release User' })).not.toBeInTheDocument();
  });

  test('hides Release widget when scope is global', async () => {
    jest.spyOn(medplum, 'isProjectAdmin').mockImplementation(() => true);
    jest.spyOn(medplum, 'readResource').mockImplementation(((resourceType: string, id: string) => {
      if (resourceType === 'User' && id === '123') {
        return Promise.resolve({ resourceType: 'User', id: '123' } as User);
      }
      return MockClient.prototype.readResource.call(medplum, resourceType as any, id);
    }) as any);

    setup();

    await waitFor(() => expect(screen.getByText('Global', { selector: '.mantine-Badge-label' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Release User' })).not.toBeInTheDocument();
  });
});
