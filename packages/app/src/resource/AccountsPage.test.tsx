// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import { MockClient } from '@medplum/mock';
import { ErrorBoundary, Loading, MedplumProvider } from '@medplum/react';
import { act, render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import { MemoryRouter } from 'react-router';
import { AppRoutes } from '../AppRoutes';

describe('AccountsPage', () => {
  async function setup(url: string, medplum = new MockClient()): Promise<void> {
    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <MemoryRouter initialEntries={[url]} initialIndex={0}>
            <MantineProvider>
              <Notifications />
              <ErrorBoundary>
                <Suspense fallback={<Loading />}>
                  <AppRoutes />
                </Suspense>
              </ErrorBoundary>
            </MantineProvider>
          </MemoryRouter>
        </MedplumProvider>
      );
    });
  }

  afterEach(async () => {
    await act(async () => notifications.clean());
  });

  test('Patient shows accounts form', async () => {
    const medplum = new MockClient();
    jest.spyOn(medplum, 'isProjectAdmin').mockReturnValue(true);
    await setup('/Patient/123/accounts', medplum);
    expect(await screen.findByText('Current Accounts')).toBeInTheDocument();
  });

  test('Patient non-admin shows access message', async () => {
    const medplum = new MockClient();
    jest.spyOn(medplum, 'isProjectAdmin').mockReturnValue(false);
    jest.spyOn(medplum, 'isSuperAdmin').mockReturnValue(false);
    await setup('/Patient/123/accounts', medplum);
    expect(await screen.findByText('Admin access required')).toBeInTheDocument();
  });

  test('Unsupported resource type', async () => {
    await setup('/Practitioner/123/accounts');
    expect(await screen.findByText('Unsupported resource type')).toBeInTheDocument();
  });
});
