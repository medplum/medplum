// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import type { Task } from '@medplum/fhirtypes';
import { MemoryRouter, Routes, Route } from 'react-router';
import type { NavigateFunction } from 'react-router';
import * as reactRouter from 'react-router';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { TasksPage } from './TasksPage';

describe('TasksPage', () => {
  let medplum: MockClient;
  let navigateSpy: NavigateFunction;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
    navigateSpy = vi.fn() as NavigateFunction;
    vi.spyOn(reactRouter, 'useNavigate').mockReturnValue(navigateSpy);
  });

  const setup = (initialPath = '/Task'): ReturnType<typeof render> => {
    return render(
      <MemoryRouter initialEntries={[initialPath]}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Routes>
              <Route path="/Task/:taskId?" element={<TasksPage />} />
            </Routes>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  const mockTask: Task & { id: string } = {
    resourceType: 'Task',
    id: 'task-123',
    status: 'in-progress',
    intent: 'order',
    code: { text: 'Test Task' },
    authoredOn: '2023-01-01T12:00:00Z',
  };

  test('renders TaskBoard component', async () => {
    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 0,
      entry: [],
    } as any);

    setup('/Task?_sort=-_lastUpdated&_count=20&_total=accurate');

    await waitFor(() => {
      expect(screen.getByText('My Tasks')).toBeInTheDocument();
      expect(screen.getByText('All Tasks')).toBeInTheDocument();
    });
  });

  test('passes taskId from URL params to TaskBoard', async () => {
    await medplum.createResource(mockTask);
    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 1,
      entry: [{ resource: mockTask }],
    } as any);
    vi.spyOn(medplum, 'readResource').mockResolvedValue(mockTask);

    setup('/Task/task-123?_sort=-_lastUpdated&_count=20&_total=accurate');

    await waitFor(() => {
      expect(screen.getByText('My Tasks')).toBeInTheDocument();
    });

    // Verify that TaskBoard receives the taskId by checking if readResource is called
    await waitFor(
      () => {
        expect(medplum.readResource).toHaveBeenCalledWith('Task', 'task-123');
      },
      { timeout: 3000 }
    );
  });

  test('passes correct query prop to TaskBoard', async () => {
    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 0,
      entry: [],
    } as any);

    setup('/Task?_sort=-_lastUpdated&_count=20&_total=accurate');

    await waitFor(() => {
      expect(screen.getByText('My Tasks')).toBeInTheDocument();
    });

    // Verify that search was called with the correct query parameter
    await waitFor(() => {
      expect(medplum.search).toHaveBeenCalled();
      const searchCalls = vi.mocked(medplum.search).mock.calls;
      expect(searchCalls.length).toBeGreaterThan(0);
      // Check that the query includes the sort parameter
      const queryString = searchCalls[0][1] as string;
      expect(queryString).toContain('_sort=-_lastUpdated');
    });
  });

  test('passes undefined selectedTaskId when no taskId in URL', async () => {
    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 0,
      entry: [],
    } as any);
    const readResourceSpy = vi.spyOn(medplum, 'readResource');

    setup('/Task?_sort=-_lastUpdated&_count=20&_total=accurate');

    await waitFor(() => {
      expect(screen.getByText('My Tasks')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(readResourceSpy).not.toHaveBeenCalled();
    });
  });
});
