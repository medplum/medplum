// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MedplumProvider } from '@medplum/react';
import type { Task, Practitioner, Bundle } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { TaskBoard } from './TaskBoard';
import type { WithId } from '@medplum/core';

describe('TaskBoard', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  const setup = (
    query: string = '',
    props: Partial<React.ComponentProps<typeof TaskBoard>> = {}
  ): ReturnType<typeof render> => {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <TaskBoard
              query={query}
              selectedTaskId={undefined}
              onDelete={vi.fn()}
              onNew={vi.fn()}
              onChange={vi.fn()}
              getTaskUri={vi.fn((task: Task) => `/Task/${task.id}`)}
              myTasksUri="/Task?owner=Patient/123&_sort=-_lastUpdated"
              allTasksUri="/Task?_sort=-_lastUpdated"
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
    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 0,
      entry: [],
    } as any);

    setup();

    await waitFor(() => {
      expect(screen.getByText('No tasks available.')).toBeInTheDocument();
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
    setup('', { selectedTaskId: 'task-123' });

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
    setup('', { selectedTaskId: 'task-123' });

    await waitFor(() => {
      expect(screen.getByText('Properties')).toBeInTheDocument();
    });
  });

  test('handles task not found scenario', async () => {
    setup('', { selectedTaskId: 'non-existent-task' });

    await waitFor(() => {
      expect(screen.getByText('No task selected')).toBeInTheDocument();
    });
  });

  test('passes getTaskUri to TaskListItem when provided', async () => {
    await medplum.createResource(mockTask);
    const getTaskUri = vi.fn((task: Task) => `/Custom/${task.id}`);
    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 1,
      entry: [{ resource: mockTask }],
    } as any);

    setup('', { getTaskUri });

    await waitFor(() => {
      expect(screen.getByText('Test Task')).toBeInTheDocument();
    });

    const links = screen.getAllByRole('link');
    const taskLink = links.find((link) => link.getAttribute('href')?.includes('/Custom/task-123'));
    expect(taskLink).toBeDefined();
    expect(taskLink).toHaveAttribute('href', '/Custom/task-123');
  });

  test('uses getTaskUri URL', async () => {
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

    const links = screen.getAllByRole('link');
    const taskLink = links.find((link) => link.getAttribute('href')?.includes('/Task/task-123'));
    expect(taskLink).toBeDefined();
    expect(taskLink).toHaveAttribute('href', '/Task/task-123');
  });

  test('includes pagination parameters in search request', async () => {
    const searchSpy = vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 50,
      entry: [],
    } as any);

    setup('_offset=0&_count=20&_total=accurate');

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

    const onChange = vi.fn();

    setup('_offset=0&_count=20&_sort=-_lastUpdated', { onChange });

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
      // Should call onChange with SearchRequest containing offset=20
      expect(onChange).toHaveBeenCalled();
      const call = onChange.mock.calls[0];
      expect(call[0]).toHaveProperty('offset', 20);
    });
  });

  test('resets to page 1 when filters change', async () => {
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

    // Switch to All Tasks (this should navigate to reset pagination)
    const allTasksLink = screen.getByRole('link', { name: 'All Tasks' });
    expect(allTasksLink).toHaveAttribute('href', '/Task?_sort=-_lastUpdated');
  });

  test('filters and displays only in-progress tasks, then selects and marks as completed the first task', async () => {
    const inProgressTask1: Task = {
      ...mockTask,
      id: 'task-in-progress-1',
      status: 'in-progress',
      code: { text: 'First In Progress Task' },
      description: 'Test task description',
    };

    const inProgressTask2: Task = {
      ...mockTask,
      id: 'task-in-progress-2',
      status: 'in-progress',
      code: { text: 'Second In Progress Task' },
    };

    const completedTask: Task = {
      ...mockTask,
      id: 'task-completed',
      status: 'completed',
      code: { text: 'Completed Task' },
    };

    await medplum.createResource(inProgressTask1);
    await medplum.createResource(inProgressTask2);
    await medplum.createResource(completedTask);

    // Mock search to return only in-progress tasks (with all required IDs)
    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 2,
      entry: [
        { resource: { ...inProgressTask1, id: 'task-in-progress-1' } },
        { resource: { ...inProgressTask2, id: 'task-in-progress-2' } },
      ],
    } as Bundle<Task & { id: string }>);

    vi.spyOn(medplum, 'readResource').mockResolvedValue({ ...inProgressTask1, id: 'task-in-progress-1' });

    const { rerender } = setup('status=in-progress');
    await waitFor(() => {
      expect(screen.getByText('First In Progress Task')).toBeInTheDocument();
      expect(screen.getByText('Second In Progress Task')).toBeInTheDocument();
    });

    expect(screen.queryByText('Completed Task')).not.toBeInTheDocument();

    const user = userEvent.setup();
    const firstTaskLink = screen.getByRole('link', { name: /First In Progress Task/ });
    await user.click(firstTaskLink);

    rerender(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <TaskBoard
              query="status=in-progress"
              selectedTaskId="task-in-progress-1"
              onDelete={vi.fn()}
              onNew={vi.fn()}
              onChange={vi.fn()}
              getTaskUri={vi.fn((task: Task) => `/Task/${task.id}`)}
              myTasksUri="/Task?owner=Patient/123&_sort=-_lastUpdated"
              allTasksUri="/Task?_sort=-_lastUpdated"
            />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );

    await waitFor(
      () => {
        expect(screen.getByText('Test task description')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    const completedTask1: Task = {
      ...inProgressTask1,
      id: 'task-in-progress-1',
      status: 'completed',
    };
    vi.spyOn(medplum, 'updateResource').mockResolvedValue(completedTask1 as Task & { id: string });

    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 1,
      entry: [{ resource: { ...inProgressTask2, id: 'task-in-progress-2' } }],
    } as Bundle<Task & { id: string }>);

    const completeButton = screen.getByLabelText('Mark as Completed');
    await user.click(completeButton);

    await waitFor(
      () => {
        expect(screen.queryByText('First In Progress Task')).not.toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    expect(screen.getByText('Second In Progress Task')).toBeInTheDocument();
  });

  test('creates new task and it should be visible on screen by title', async () => {
    const user = userEvent.setup();
    const newTaskTitle = 'New Test Task';
    const newTask: Task = {
      resourceType: 'Task',
      id: 'new-task-123',
      status: 'draft',
      intent: 'order',
      code: { text: newTaskTitle },
      authoredOn: '2023-01-01T12:00:00Z',
    };

    // Mock search to return empty initially, then include the new task after creation
    const searchSpy = vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 0,
      entry: [],
    } as Bundle<WithId<Task>>);

    setup();

    await waitFor(() => {
      expect(screen.getByText('My Tasks')).toBeInTheDocument();
    });

    // Open the new task modal
    const plusButtons = screen.getAllByRole('button');
    const plusButton = plusButtons.find((btn) => btn.querySelector('svg.tabler-icon-plus'));
    expect(plusButton).toBeDefined();

    await user.click(plusButton as Element);

    await waitFor(() => {
      expect(screen.getByText('Create New Task')).toBeInTheDocument();
    });

    const titleInput = screen.getByPlaceholderText('Enter task title');
    await user.type(titleInput, newTaskTitle);

    vi.spyOn(medplum, 'createResource').mockResolvedValue(newTask as Task & { id: string });

    searchSpy.mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 1,
      entry: [{ resource: newTask }],
    } as Bundle<WithId<Task>>);

    const createButton = screen.getByRole('button', { name: 'Create Task' });
    await user.click(createButton);

    await waitFor(
      () => {
        expect(screen.getByText(newTaskTitle)).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  test('parses priority filter from URL query string', async () => {
    const urgentTask: Task = {
      ...mockTask,
      id: 'urgent-task',
      priority: 'urgent',
      code: { text: 'Urgent Task' },
    };

    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 1,
      entry: [{ resource: urgentTask }],
    } as Bundle<WithId<Task>>);

    setup('priority=urgent');

    await waitFor(() => {
      expect(screen.getByText('Urgent Task')).toBeInTheDocument();
    });

    expect(medplum.search).toHaveBeenCalledWith('Task', expect.stringContaining('priority=urgent'), expect.any(Object));
  });

  test('handles multiple priorities in URL query string', async () => {
    const urgentTask: Task = {
      ...mockTask,
      id: 'urgent-task',
      priority: 'urgent',
      code: { text: 'Urgent Task' },
    };

    const statTask: Task = {
      ...mockTask,
      id: 'stat-task',
      priority: 'stat',
      code: { text: 'Stat Task' },
    };

    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 2,
      entry: [{ resource: urgentTask }, { resource: statTask }],
    } as Bundle<WithId<Task>>);

    setup('priority=urgent,stat');

    await waitFor(() => {
      expect(screen.getByText('Urgent Task')).toBeInTheDocument();
      expect(screen.getByText('Stat Task')).toBeInTheDocument();
    });

    expect(medplum.search).toHaveBeenCalledWith(
      'Task',
      expect.stringContaining('priority=urgent,stat'),
      expect.any(Object)
    );
  });

  test('calls onChange with priority filter when priority is selected', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 0,
      entry: [],
    } as Bundle<WithId<Task>>);

    setup('', { onChange });

    await waitFor(() => {
      expect(screen.getByLabelText('Filter tasks')).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText('Filter tasks'));

    await waitFor(() => {
      expect(screen.getByText('Priority')).toBeInTheDocument();
    });
    await user.hover(screen.getByText('Priority'));

    await waitFor(() => {
      expect(screen.getByText('urgent')).toBeInTheDocument();
    });

    await user.click(screen.getByText('urgent'));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });

    const call = onChange.mock.calls[0];
    expect(call[0].filters).toContainEqual({
      code: 'priority',
      operator: 'eq',
      value: 'urgent',
    });
    expect(call[0].offset).toBe(0);
  });

  test('toggles priority filter when same priority is selected twice', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 0,
      entry: [],
    } as Bundle<WithId<Task>>);

    setup('priority=urgent', { onChange });

    await waitFor(() => {
      expect(screen.getByLabelText('Filter tasks')).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText('Filter tasks'));

    await waitFor(() => {
      expect(screen.getByText('Priority')).toBeInTheDocument();
    });

    await user.hover(screen.getByText('Priority'));

    await waitFor(() => {
      expect(screen.getByText('urgent')).toBeInTheDocument();
    });

    await user.click(screen.getByText('urgent'));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });

    const call = onChange.mock.calls[0];
    const priorityFilters = call[0].filters?.filter((f: any) => f.code === 'priority');
    expect(priorityFilters).toEqual([]);
  });

  test('combines priority and status filters', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 0,
      entry: [],
    } as Bundle<WithId<Task>>);

    setup('status=in-progress', { onChange });

    await waitFor(() => {
      expect(screen.getByLabelText('Filter tasks')).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText('Filter tasks'));

    await waitFor(() => {
      expect(screen.getByText('Priority')).toBeInTheDocument();
    });

    await user.hover(screen.getByText('Priority'));

    await waitFor(() => {
      expect(screen.getByText('urgent')).toBeInTheDocument();
    });

    await user.click(screen.getByText('urgent'));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });

    const call = onChange.mock.calls[0];
    expect(call[0].filters).toContainEqual({
      code: 'status',
      operator: 'eq',
      value: 'in-progress',
    });
    expect(call[0].filters).toContainEqual({
      code: 'priority',
      operator: 'eq',
      value: 'urgent',
    });
  });
});
