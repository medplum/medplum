// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MedplumProvider } from '@medplum/react';
import type { Task, Practitioner } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { TaskBoard } from './TaskBoard';

describe('TaskBoard', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  const setup = (props: Partial<React.ComponentProps<typeof TaskBoard>> = {}): ReturnType<typeof render> => {
    const defaultOnSelectedItem = (task: Task): string => `/Task/${task.id}`;
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <TaskBoard
              query=""
              selectedTaskId={undefined}
              onTaskChange={vi.fn()}
              onDeleteTask={vi.fn()}
              onSelectedItem={defaultOnSelectedItem}
              {...props}
            />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  const mockTask: Task = {
    resourceType: 'Task',
    id: 'task-123',
    status: 'in-progress',
    intent: 'order',
    code: { text: 'Test Task' },
    authoredOn: '2023-01-01T12:00:00Z',
  };

  test('renders task board with My Tasks and All Tasks buttons', async () => {
    setup();

    await waitFor(() => {
      expect(screen.getByText('My Tasks')).toBeInTheDocument();
      expect(screen.getByText('All Tasks')).toBeInTheDocument();
    });
  });

  test('displays tasks in the list', async () => {
    await medplum.createResource(mockTask);
    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 1,
      entry: [{ resource: mockTask }],
    } as any);

    setup();

    await waitFor(
      () => {
        expect(screen.getByText('Test Task')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  test('shows empty state when no tasks are found', async () => {
    setup();

    await waitFor(() => {
      expect(screen.getByText('No tasks found')).toBeInTheDocument();
    });
  });

  test('switches between My Tasks and All Tasks', async () => {
    const user = userEvent.setup();
    await medplum.createResource(mockTask);
    setup();

    await waitFor(() => {
      expect(screen.getByText('My Tasks')).toBeInTheDocument();
    });
    await user.click(screen.getByText('All Tasks'));
    await waitFor(() => {
      expect(screen.getByText('All Tasks')).toBeInTheDocument();
    });
  });

  test('opens new task modal when plus button is clicked', async () => {
    const user = userEvent.setup();
    setup();

    await waitFor(() => {
      expect(screen.getByText('My Tasks')).toBeInTheDocument();
    });
    const plusButtons = screen.getAllByRole('button');
    const plusButton = plusButtons.find((btn) => btn.querySelector('svg.tabler-icon-plus'));
    expect(plusButton).toBeDefined();

    if (plusButton) {
      await user.click(plusButton);

      await waitFor(() => {
        expect(screen.getByText('Create New Task')).toBeInTheDocument();
      });
    }
  });

  test('displays selected task in detail panel', async () => {
    await medplum.createResource(mockTask);
    setup({ selectedTaskId: 'task-123' });

    await waitFor(() => {
      expect(screen.getByText('Properties')).toBeInTheDocument();
    });
  });

  test('shows TaskSelectEmpty when no task is selected', async () => {
    setup();

    await waitFor(() => {
      expect(screen.getByText('No task selected')).toBeInTheDocument();
    });
  });

  test('renders filter menu', async () => {
    const user = userEvent.setup();
    await medplum.createResource(mockTask);
    await medplum.createResource({
      ...mockTask,
      id: 'task-456',
      status: 'completed',
      code: { text: 'Completed Task' },
    });

    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 1,
      entry: [{ resource: mockTask }],
    } as any);

    setup();

    await waitFor(() => {
      expect(screen.getByLabelText('Filter tasks')).toBeInTheDocument();
    });

    // Open filter menu
    await user.click(screen.getByLabelText('Filter tasks'));

    await waitFor(() => {
      expect(screen.getByText('Status')).toBeInTheDocument();
    });
  });

  test('fetches and displays performer types', async () => {
    const practitioner: Practitioner = {
      resourceType: 'Practitioner',
      id: 'prac-123',
      name: [{ given: ['John'], family: 'Doe' }],
    };

    const taskWithPerformer = {
      ...mockTask,
      performerType: [{ coding: [{ code: 'doctor', display: 'Doctor' }] }],
    };

    await medplum.createResource(practitioner);
    await medplum.createResource(taskWithPerformer);

    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 1,
      entry: [{ resource: taskWithPerformer }],
    } as any);

    setup();

    await waitFor(() => {
      expect(screen.getByText('Test Task')).toBeInTheDocument();
    });
  });

  test('handles task selection from URL parameter', async () => {
    await medplum.createResource(mockTask);
    setup({ selectedTaskId: 'task-123' });

    await waitFor(() => {
      expect(screen.getByText('Properties')).toBeInTheDocument();
    });
  });

  test('handles task not found scenario', async () => {
    setup({ selectedTaskId: 'non-existent-task' });

    await waitFor(() => {
      expect(screen.getByText('No task selected')).toBeInTheDocument();
    });
  });

  test('passes onSelectedItem to TaskListItem when provided', async () => {
    await medplum.createResource(mockTask);
    const onSelectedItem = vi.fn((task: Task) => `/Custom/${task.id}`);
    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 1,
      entry: [{ resource: mockTask }],
    } as any);

    setup({ onSelectedItem });

    await waitFor(() => {
      expect(screen.getByText('Test Task')).toBeInTheDocument();
    });

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/Custom/task-123');
  });

  test('uses onSelectedItem URL', async () => {
    await medplum.createResource(mockTask);
    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 1,
      entry: [{ resource: mockTask }],
    } as any);

    setup();

    await waitFor(() => {
      expect(screen.getByText('Test Task')).toBeInTheDocument();
    });

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/Task/task-123');
  });

  test('includes pagination parameters in search request', async () => {
    const searchSpy = vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 50,
      entry: [],
    } as any);

    setup();

    await waitFor(() => {
      expect(searchSpy).toHaveBeenCalled();
    });

    const searchCall = searchSpy.mock.calls[0];
    expect(searchCall[1]).toContain('_offset=');
    expect(searchCall[1]).toContain('_count=');
    expect(searchCall[1]).toContain('_total=accurate');
  });

  test('displays pagination controls when total exceeds items per page', async () => {
    const tasks = Array.from({ length: 25 }, (_, i) => ({
      ...mockTask,
      id: `task-${i}`,
      code: { text: `Task ${i}` },
    }));

    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 25,
      entry: tasks.slice(0, 20).map((task) => ({ resource: task })),
    } as any);

    setup();

    await waitFor(() => {
      const pagination = document.querySelector('.mantine-Pagination-root');
      expect(pagination).toBeInTheDocument();
    });
  });

  test('does not display pagination when total is less than items per page', async () => {
    await medplum.createResource(mockTask);

    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 5,
      entry: [{ resource: mockTask }],
    } as any);

    setup();

    await waitFor(() => {
      expect(screen.getByText('Test Task')).toBeInTheDocument();
    });

    const pagination = document.querySelector('.mantine-Pagination-root');
    expect(pagination).not.toBeInTheDocument();
  });

  test('changes page when pagination is clicked', async () => {
    const user = userEvent.setup();
    const tasks = Array.from({ length: 25 }, (_, i) => ({
      ...mockTask,
      id: `task-${i}`,
      code: { text: `Task ${i}` },
    }));

    const searchSpy = vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 25,
      entry: tasks.slice(0, 20).map((task) => ({ resource: task })),
    } as any);

    setup();

    await waitFor(() => {
      expect(searchSpy).toHaveBeenCalled();
    });

    // Wait for pagination to render
    await waitFor(() => {
      const pagination = document.querySelector('.mantine-Pagination-root');
      expect(pagination).toBeInTheDocument();
    });

    // Click next page button (page 2)
    const page2Button = screen.getByRole('button', { name: /2/i });
    if (page2Button) {
      await user.click(page2Button);
    }

    await waitFor(() => {
      // Should make another search call with offset=20
      const callsWithOffset20 = searchSpy.mock.calls.filter((call) => {
        const params = call[1];
        if (typeof params === 'string') {
          return params.includes('_offset=20');
        } else if (params instanceof URLSearchParams) {
          return params.get('_offset') === '20';
        } else if (Array.isArray(params)) {
          return params.some((kv) => Array.isArray(kv) && kv[0] === '_offset' && kv[1] === '20');
        } else if (typeof params === 'object' && params !== null) {
          return params['_offset'] === 20 || params['_offset'] === '20';
        }
        return false;
      });
      expect(callsWithOffset20.length).toBeGreaterThan(0);
    });
  });

  test('resets to page 1 when filters change', async () => {
    const user = userEvent.setup();
    const searchSpy = vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 25,
      entry: [],
    } as any);

    setup();

    await waitFor(() => {
      expect(searchSpy).toHaveBeenCalled();
    });

    // Clear previous calls
    searchSpy.mockClear();

    // Switch to All Tasks (this should reset pagination)
    await user.click(screen.getByText('All Tasks'));

    await waitFor(() => {
      // Should make search call with offset=0 (first page)
      expect(searchSpy).toHaveBeenCalledWith('Task', expect.stringContaining('_offset=0'), expect.any(Object));
    });
  });
});
