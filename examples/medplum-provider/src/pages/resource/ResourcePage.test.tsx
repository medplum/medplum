// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { MockClient } from '@medplum/mock';
import { ErrorBoundary, Loading, MedplumProvider } from '@medplum/react';
import { Suspense } from 'react';
import { MemoryRouter } from 'react-router';
import { App } from '../../App';
import { AppsPanelProvider } from '../../components/AppsPanel';
import { act, render, screen } from '../../test-utils/render';

describe('ResourcePage', () => {
  async function setup(url: string, medplum = new MockClient()): Promise<void> {
    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <MemoryRouter initialEntries={[url]} initialIndex={0}>
            <MantineProvider>
              <Notifications />
              <ErrorBoundary>
                <Suspense fallback={<Loading />}>
                  <AppsPanelProvider>
                    <App />
                  </AppsPanelProvider>
                </Suspense>
              </ErrorBoundary>
            </MantineProvider>
          </MemoryRouter>
        </MedplumProvider>
      );
    });
  }

  test('Details tab renders', async () => {
    await setup('/Practitioner/123');
    expect(screen.getByText('Gender')).toBeInTheDocument();
  });
});
