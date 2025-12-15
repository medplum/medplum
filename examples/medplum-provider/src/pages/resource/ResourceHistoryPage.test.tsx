// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { Practitioner } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { describe, expect, test, vi, beforeEach } from 'vitest';
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
    setup('/123/history');
    await waitFor(() => {
      expect(screen.queryByText('History')).not.toBeInTheDocument();
    });
  });

  test('Returns null when id is missing', async () => {
    setup('/Practitioner/history');

    await waitFor(() => {
      expect(screen.queryByText('History')).not.toBeInTheDocument();
    });
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
