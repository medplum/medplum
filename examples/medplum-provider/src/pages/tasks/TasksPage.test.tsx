// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { Task } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { NavigateFunction } from 'react-router';
import * as reactRouter from 'react-router';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
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
              <Route path="/Task" element={<TasksPage />} />
              <Route path="/Task/new" element={<TasksPage />} />
              <Route path="/Task/:taskId" element={<TasksPage />} />
              <Route path="/Task/:taskId/new" element={<TasksPage />} />
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

  test('opens new task modal when URL is /Task/new', async () => {
    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 0,
      entry: [],
    } as any);

    setup('/Task/new?_sort=-_lastUpdated&_count=20&_total=accurate');

    await waitFor(() => {
      expect(screen.getByText('My Tasks')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('Create New Task')).toBeInTheDocument();
    });
  });

  test('opens new task modal over a task when URL is /Task/:taskId/new', async () => {
    await medplum.createResource(mockTask);
    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 1,
      entry: [{ resource: mockTask }],
    } as any);
    vi.spyOn(medplum, 'readResource').mockResolvedValue(mockTask);

    setup('/Task/task-123/new?_sort=-_lastUpdated&_count=20&_total=accurate');

    await waitFor(
      () => {
        expect(medplum.readResource).toHaveBeenCalledWith('Task', 'task-123');
      },
      { timeout: 3000 }
    );

    await waitFor(() => {
      expect(screen.getByText('Create New Task')).toBeInTheDocument();
    });
  });

  test('does not open new task modal on the list view', async () => {
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

    expect(screen.queryByText('Create New Task')).not.toBeInTheDocument();
  });

  test('clicking new task button navigates to /Task/new', async () => {
    const user = userEvent.setup();
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

    const plusButton = screen.getAllByRole('button').find((btn) => btn.querySelector('.tabler-icon-plus'));
    expect(plusButton).toBeDefined();
    await user.click(plusButton as HTMLElement);

    expect(navigateSpy).toHaveBeenCalledWith(expect.stringMatching(/^\/Task\/new\?/));
    expect(screen.queryByText('Create New Task')).not.toBeInTheDocument();
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
