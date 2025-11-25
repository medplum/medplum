// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MedplumProvider } from '@medplum/react';
import { MockClient } from '@medplum/mock';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { TaskInputNote } from './TaskInputNote';
import type { Task } from '@medplum/fhirtypes';

describe('TaskInputNote', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  const setup = (
    task: Task,
    props: Partial<React.ComponentProps<typeof TaskInputNote>> = {}
  ): ReturnType<typeof render> => {
    return render(
      <MedplumProvider medplum={medplum}>
        <MantineProvider>
          <TaskInputNote task={task} {...props} />
        </MantineProvider>
      </MedplumProvider>
    );
  };

  const mockTask: Task = {
    resourceType: 'Task',
    id: 'task-123',
    status: 'in-progress',
    intent: 'order',
    code: { text: 'Test Task' },
    note: [{ text: 'Existing note', time: '2023-01-01T12:00:00Z' }],
  };

  test('renders existing notes', async () => {
    await medplum.createResource(mockTask);
    setup(mockTask);

    // Wait for useResource to resolve
    await waitFor(() => {
      expect(screen.getByText('Existing note')).toBeInTheDocument();
    });
  });

  test('allows adding a new note', async () => {
    await medplum.createResource(mockTask);
    const onTaskChange = vi.fn();
    setup(mockTask, { onTaskChange });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Add a note...')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('Add a note...');
    fireEvent.change(input, { target: { value: 'New note content' } });

    const submitButton = screen.getByText('Submit');
    await act(async () => {
      fireEvent.click(submitButton);
    });

    expect(onTaskChange).toHaveBeenCalledWith(
      expect.objectContaining({
        note: expect.arrayContaining([expect.objectContaining({ text: 'New note content' })]),
      })
    );
  });

  test('shows delete confirmation modal', async () => {
    await medplum.createResource(mockTask);
    const onDeleteTask = vi.fn();
    setup(mockTask, { onDeleteTask });

    await waitFor(() => {
      expect(screen.getByLabelText('Delete Task')).toBeInTheDocument();
    });

    const deleteButton = screen.getByLabelText('Delete Task');
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(screen.getByText('Delete Task', { selector: '.mantine-Modal-title' })).toBeInTheDocument();
      expect(screen.getByText(/Are you sure you want to delete this task/)).toBeInTheDocument();
    });
  });

  test('calls onDeleteTask when confirmed', async () => {
    await medplum.createResource(mockTask);
    const onDeleteTask = vi.fn();
    setup(mockTask, { onDeleteTask });

    await waitFor(() => {
      expect(screen.getByLabelText('Delete Task')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Delete Task'));

    // Wait for modal to appear
    await waitFor(() => {
      expect(screen.getByText(/Are you sure you want to delete this task/)).toBeInTheDocument();
    });

    const confirmButton = screen.getByRole('button', { name: 'Delete' });

    await act(async () => {
      fireEvent.click(confirmButton);
    });

    expect(onDeleteTask).toHaveBeenCalledWith(expect.objectContaining({ id: 'task-123' }));
  });

  test('marks task as completed', async () => {
    await medplum.createResource(mockTask);
    const onTaskChange = vi.fn();
    setup(mockTask, { onTaskChange });

    await waitFor(() => {
      expect(screen.getByLabelText('Mark as Completed')).toBeInTheDocument();
    });

    const completeButton = screen.getByLabelText('Mark as Completed');
    await act(async () => {
      fireEvent.click(completeButton);
    });

    expect(onTaskChange).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
  });
});
