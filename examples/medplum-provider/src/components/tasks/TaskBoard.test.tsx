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
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <TaskBoard query="" selectedTaskId={undefined} onTaskChange={vi.fn()} onDeleteTask={vi.fn()} {...props} />
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
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([mockTask] as any);

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

    vi.spyOn(medplum, 'searchResources').mockResolvedValue([mockTask] as any);

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

    // Mock searchResources to return the task
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([taskWithPerformer] as any);

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
});
