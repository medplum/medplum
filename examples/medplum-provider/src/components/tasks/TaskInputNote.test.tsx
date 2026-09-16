// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import type { Questionnaire, QuestionnaireResponse, Reference, Task } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { SAVE_TIMEOUT_MS } from '../../config/constants';
import { TaskInputNote } from './TaskInputNote';

describe('TaskInputNote', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  afterEach(() => vi.restoreAllMocks());

  const setup = (
    task: Task | Reference<Task>,
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

  const debounced = { timeout: SAVE_TIMEOUT_MS + 2000 };

  const questionnaireFixture: Questionnaire = {
    resourceType: 'Questionnaire',
    id: 'q-note',
    status: 'active',
    item: [{ linkId: 'q1', type: 'string', text: 'Note Question' }],
  };

  const questionnaireTask: Task = {
    ...mockTask,
    id: 'task-qr',
    focus: { reference: 'Questionnaire/q-note' },
    input: [{ type: { text: 'Questionnaire' }, valueReference: { reference: 'Questionnaire/q-note' } }],
  };

  test.each(['Submit', 'Mark as Completed'])('shows an error notification when "%s" fails', async (control) => {
    const showSpy = vi.spyOn(notifications, 'show');
    const onTaskChange = vi.fn(() => {
      throw new Error('Change rejected');
    });
    setup(mockTask, { onTaskChange });

    fireEvent.change(await screen.findByPlaceholderText('Add a note...'), { target: { value: 'Failing note' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: control })));

    expect(showSpy).toHaveBeenCalledWith(expect.objectContaining({ title: 'Error', message: 'Change rejected' }));
  });

  test('dismisses the delete confirmation via Cancel or the modal close control without deleting', async () => {
    const user = userEvent.setup();
    const onDeleteTask = vi.fn();
    setup(mockTask, { onDeleteTask });

    await user.click(await screen.findByLabelText('Delete Task'));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText(/Are you sure you want to delete/)).not.toBeInTheDocument());

    await user.click(screen.getByLabelText('Delete Task'));
    expect(await screen.findByText(/Are you sure you want to delete/)).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByText(/Are you sure you want to delete/)).not.toBeInTheDocument());
    expect(onDeleteTask).not.toHaveBeenCalled();
  });

  test('renders the related questionnaire and creates a response on change', async () => {
    const user = userEvent.setup();
    await medplum.createResource(questionnaireFixture);
    await medplum.createResource(questionnaireTask);
    const createSpy = vi.spyOn(medplum, 'createResource');
    const onTaskChange = vi.fn();
    setup(questionnaireTask, { onTaskChange });

    expect(await screen.findByText('Related Questionnaire')).toBeInTheDocument();
    await user.type(await screen.findByLabelText('Note Question'), 'A');

    await waitFor(
      () => expect(onTaskChange).toHaveBeenCalledWith(expect.objectContaining({ id: 'task-qr' })),
      debounced
    );
    expect(onTaskChange.mock.calls[0][0].output?.[0]).toMatchObject({
      type: { text: 'QuestionnaireResponse' },
      valueReference: { reference: expect.stringMatching(/^QuestionnaireResponse\//) },
    });
    expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ resourceType: 'QuestionnaireResponse' }));
  });

  test('updates an existing questionnaire response without rewriting the task', async () => {
    const user = userEvent.setup();
    await medplum.createResource(questionnaireFixture);
    await medplum.createResource<QuestionnaireResponse>({
      resourceType: 'QuestionnaireResponse',
      id: 'qr-note',
      status: 'in-progress',
      questionnaire: 'Questionnaire/q-note',
    });
    const task: Task = {
      ...questionnaireTask,
      output: [
        { type: { text: 'QuestionnaireResponse' }, valueReference: { reference: 'QuestionnaireResponse/qr-note' } },
      ],
    };
    const updateSpy = vi.spyOn(medplum, 'updateResource');
    const onTaskChange = vi.fn();
    setup(task, { onTaskChange });

    await user.type(await screen.findByLabelText('Note Question'), 'A');

    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1), debounced);
    expect(updateSpy.mock.calls[0][0]).toMatchObject({ resourceType: 'QuestionnaireResponse', id: 'qr-note' });
    expect(onTaskChange).not.toHaveBeenCalled();
  });

  test('shows an error notification when saving the questionnaire response fails', async () => {
    const user = userEvent.setup();
    await medplum.createResource(questionnaireFixture);
    vi.spyOn(medplum, 'createResource').mockRejectedValue(new Error('Response rejected'));
    const showSpy = vi.spyOn(notifications, 'show');
    const onTaskChange = vi.fn();
    setup(questionnaireTask, { onTaskChange });

    await user.type(await screen.findByLabelText('Note Question'), 'A');

    await waitFor(() => {
      expect(showSpy).toHaveBeenCalledWith(expect.objectContaining({ title: 'Error', message: 'Response rejected' }));
    }, debounced);
    expect(onTaskChange).not.toHaveBeenCalled();
  });
});
