// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { Practitioner } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ResourceHistoryPage } from './ResourceHistoryPage';

describe('ResourceHistoryPage', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  const setup = (url: string): ReturnType<typeof render> => {
    return render(
      <MemoryRouter initialEntries={[url]}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <Routes>
              <Route path="/:resourceType/:id/history" element={<ResourceHistoryPage />} />
              <Route path="/:resourceType/history" element={<ResourceHistoryPage />} />
              <Route path="/history" element={<ResourceHistoryPage />} />
            </Routes>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('Renders history page', async () => {
    const practitioner = await medplum.createResource<Practitioner>({
      resourceType: 'Practitioner',
      name: [{ family: 'Test' }],
    });

    vi.spyOn(medplum, 'readHistory').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'history',
      entry: [],
    } as any);

    setup(`/Practitioner/${practitioner.id}/history`);

    await waitFor(() => {
      expect(medplum.readHistory).toHaveBeenCalledWith('Practitioner', practitioner.id);
    });
  });

  test('Calls readHistory with correct parameters', async () => {
    const practitioner = await medplum.createResource<Practitioner>({
      resourceType: 'Practitioner',
      name: [{ family: 'Test' }],
    });

    vi.spyOn(medplum, 'readHistory').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'history',
      entry: [],
    } as any);

    setup(`/Practitioner/${practitioner.id}/history`);

    await waitFor(() => {
      expect(medplum.readHistory).toHaveBeenCalledWith('Practitioner', practitioner.id);
    });
  });

  test('Returns null when resourceType is missing', async () => {
    setup('/history');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });

  test('Returns null when id is missing', async () => {
    setup('/Practitioner/history');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });

  test('Renders history table', async () => {
    const practitioner = await medplum.createResource<Practitioner>({
      resourceType: 'Practitioner',
      name: [{ family: 'Test' }],
    });

    setup(`/Practitioner/${practitioner.id}/history`);

    expect(await screen.findByText('Author')).toBeInTheDocument();
    expect(screen.getByText('Date')).toBeInTheDocument();
    expect(screen.getByText('Version')).toBeInTheDocument();
    expect(screen.getByText(practitioner.meta?.versionId as string)).toBeInTheDocument();
  });

  test('Renders with different resource types', async () => {
    const task = await medplum.createResource({
      resourceType: 'Task',
      status: 'in-progress',
      intent: 'order',
    });

    vi.spyOn(medplum, 'readHistory').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'history',
      entry: [],
    } as any);

    setup(`/Task/${task.id}/history`);

    await waitFor(() => {
      expect(medplum.readHistory).toHaveBeenCalledWith('Task', task.id);
    });
  });
});
