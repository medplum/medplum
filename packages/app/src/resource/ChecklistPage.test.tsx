// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { MockClient } from '@medplum/mock';
import { ErrorBoundary, Loading, MedplumProvider } from '@medplum/react';
import { Suspense } from 'react';
import { MemoryRouter } from 'react-router';
import { AppRoutes } from '../AppRoutes';
import { act, fireEvent, render, screen } from '../test-utils/render';

describe('ChecklistPage', () => {
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

  test('RequestGroup checklist', async () => {
    await setup('/RequestGroup/workflow-request-group-1/checklist');
    expect(await screen.findByText('Checklist')).toBeInTheDocument();
  });

  test('Start task', async () => {
    await setup('/RequestGroup/workflow-request-group-1/checklist');

    expect(screen.getByText('Patient Registration')).toBeDefined();

    const startButtons = screen.getAllByText('Start');
    expect(startButtons).toHaveLength(2);

    await act(async () => {
      fireEvent.click(startButtons[0]);
    });

    // Should navigate to the form
    const result = await screen.findAllByText('Surgery History');
    expect(result?.[0]).toBeInTheDocument();
  });

  test('Edit task', async () => {
    await setup('/RequestGroup/workflow-request-group-1/checklist');

    expect(screen.getByText('Patient Registration')).toBeDefined();

    const editButtons = screen.getAllByText('Edit');

    await act(async () => {
      fireEvent.click(editButtons[0]);
    });

    // Should navigate to the request group
    const result = await screen.findByText('workflow-request-group-1');
    expect(result).toBeInTheDocument();
  });
});
