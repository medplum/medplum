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

  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  const questionnaireFixture: Questionnaire = {
    resourceType: 'Questionnaire',
    id: 'q-note',
    status: 'active',
    item: [{ linkId: 'q1', type: 'string', text: 'Note Question' }],
  };

  const questionnaireTask: Task = {
    ...mockTask,
    id: 'task-qr',
    note: undefined,
    focus: { reference: 'Questionnaire/q-note' },
    input: [{ type: { text: 'Questionnaire' }, valueReference: { reference: 'Questionnaire/q-note' } }],
  };

  test('shows a loader until a task reference resolves', async () => {
    await medplum.createResource(mockTask);
    setup({ reference: 'Task/task-123' });

    expect(screen.queryByText('Notes')).not.toBeInTheDocument();
    expect(document.querySelector('.mantine-Loader-root')).toBeInTheDocument();

    expect(await screen.findByText('Existing note')).toBeInTheDocument();
    expect(screen.getByText('Notes')).toBeInTheDocument();
  });

  test('falls back to a generic title with the authored date and shows the description', async () => {
    const task: Task = {
      ...mockTask,
      id: 'task-untitled',
      code: undefined,
      authoredOn: '2023-05-01T12:00:00Z',
      description: 'Call the patient back',
    };
    await medplum.createResource(task);
    setup(task);

    expect(await screen.findByText(/^Task from /)).toBeInTheDocument();
    expect(screen.getByText('Call the patient back')).toBeInTheDocument();
  });

  test('hides the edit actions and note input when allowEdit is false', async () => {
    await medplum.createResource(mockTask);
    setup(mockTask, { allowEdit: false, onDeleteTask: vi.fn() });

    expect(await screen.findByText('Existing note')).toBeInTheDocument();
    expect(screen.queryByLabelText('Delete Task')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Mark as Completed')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Add a note...')).not.toBeInTheDocument();
  });

  test('does not render the delete action without an onDeleteTask handler', async () => {
    await medplum.createResource(mockTask);
    setup(mockTask);

    expect(await screen.findByLabelText('Mark as Completed')).toBeInTheDocument();
    expect(screen.queryByLabelText('Delete Task')).not.toBeInTheDocument();
  });

  test('keeps the submit button disabled while the note is blank', async () => {
    await medplum.createResource(mockTask);
    setup(mockTask, { onTaskChange: vi.fn() });

    const input = await screen.findByPlaceholderText('Add a note...');
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();

    fireEvent.change(input, { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();

    fireEvent.change(input, { target: { value: 'Real note' } });
    expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled();
  });

  test('clears the note input after a successful submit', async () => {
    await medplum.createResource(mockTask);
    setup(mockTask, { onTaskChange: vi.fn() });

    const input = await screen.findByPlaceholderText('Add a note...');
    fireEvent.change(input, { target: { value: 'New note content' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Submit'));
    });

    expect(input).toHaveValue('');
  });

  test('shows an error notification when adding a note fails', async () => {
    await medplum.createResource(mockTask);
    const showSpy = vi.spyOn(notifications, 'show');
    const onTaskChange = vi.fn(() => {
      throw new Error('Note rejected');
    });
    setup(mockTask, { onTaskChange });

    const input = await screen.findByPlaceholderText('Add a note...');
    fireEvent.change(input, { target: { value: 'Failing note' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Submit'));
    });

    expect(showSpy).toHaveBeenCalledWith(expect.objectContaining({ title: 'Error', message: 'Note rejected' }));
    expect(input).toHaveValue('Failing note');
  });

  test('shows an error notification when marking as completed fails', async () => {
    await medplum.createResource(mockTask);
    const showSpy = vi.spyOn(notifications, 'show');
    const onTaskChange = vi.fn(() => {
      throw new Error('Completion rejected');
    });
    setup(mockTask, { onTaskChange });

    const completeButton = await screen.findByLabelText('Mark as Completed');
    await act(async () => {
      fireEvent.click(completeButton);
    });

    expect(showSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Error', message: 'Completion rejected' })
    );
  });

  test('persists the completed status through the debounced update', async () => {
    await medplum.createResource(mockTask);
    const updateSpy = vi.spyOn(medplum, 'updateResource');
    setup(mockTask, { onTaskChange: vi.fn() });

    const completeButton = await screen.findByLabelText('Mark as Completed');
    await act(async () => {
      fireEvent.click(completeButton);
    });

    await waitFor(
      () => {
        expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'task-123', status: 'completed' }));
      },
      { timeout: SAVE_TIMEOUT_MS + 2000 }
    );
  });

  test('cancels the delete confirmation without deleting', async () => {
    await medplum.createResource(mockTask);
    const onDeleteTask = vi.fn();
    setup(mockTask, { onDeleteTask });

    fireEvent.click(await screen.findByLabelText('Delete Task'));
    expect(await screen.findByText(/Are you sure you want to delete this task/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.queryByText(/Are you sure you want to delete this task/)).not.toBeInTheDocument();
    });
    expect(onDeleteTask).not.toHaveBeenCalled();
  });

  test('closes the delete confirmation with the modal close control', async () => {
    const user = userEvent.setup();
    await medplum.createResource(mockTask);
    const onDeleteTask = vi.fn();
    setup(mockTask, { onDeleteTask });

    await user.click(await screen.findByLabelText('Delete Task'));
    expect(await screen.findByText(/Are you sure you want to delete this task/)).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByText(/Are you sure you want to delete this task/)).not.toBeInTheDocument();
    });
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
    const input = await screen.findByLabelText('Note Question');
    await user.type(input, 'A');

    await waitFor(
      () => {
        expect(onTaskChange).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'task-qr',
            output: [
              expect.objectContaining({
                type: { text: 'QuestionnaireResponse' },
                valueReference: expect.objectContaining({
                  reference: expect.stringMatching(/^QuestionnaireResponse\//),
                }),
              }),
            ],
          })
        );
      },
      { timeout: SAVE_TIMEOUT_MS + 2000 }
    );
    expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ resourceType: 'QuestionnaireResponse' }));
  });

  test('updates an existing questionnaire response without rewriting the task', async () => {
    const user = userEvent.setup();
    await medplum.createResource(questionnaireFixture);
    const existingResponse: QuestionnaireResponse = {
      resourceType: 'QuestionnaireResponse',
      id: 'qr-note',
      status: 'in-progress',
      questionnaire: 'Questionnaire/q-note',
    };
    await medplum.createResource(existingResponse);
    const task: Task = {
      ...questionnaireTask,
      output: [
        { type: { text: 'QuestionnaireResponse' }, valueReference: { reference: 'QuestionnaireResponse/qr-note' } },
      ],
    };
    await medplum.createResource(task);
    const updateSpy = vi.spyOn(medplum, 'updateResource');
    const onTaskChange = vi.fn();
    setup(task, { onTaskChange });

    const input = await screen.findByLabelText('Note Question');
    await user.type(input, 'A');

    await waitFor(
      () => {
        expect(updateSpy).toHaveBeenCalledWith(
          expect.objectContaining({ resourceType: 'QuestionnaireResponse', id: 'qr-note' })
        );
      },
      { timeout: SAVE_TIMEOUT_MS + 2000 }
    );
    expect(updateSpy).not.toHaveBeenCalledWith(expect.objectContaining({ resourceType: 'Task' }));
    expect(onTaskChange).not.toHaveBeenCalled();
  });

  test('shows an error notification when saving the questionnaire response fails', async () => {
    const user = userEvent.setup();
    await medplum.createResource(questionnaireFixture);
    await medplum.createResource(questionnaireTask);
    vi.spyOn(medplum, 'createResource').mockRejectedValue(new Error('Response rejected'));
    const showSpy = vi.spyOn(notifications, 'show');
    const onTaskChange = vi.fn();
    setup(questionnaireTask, { onTaskChange });

    const input = await screen.findByLabelText('Note Question');
    await user.type(input, 'A');

    await waitFor(
      () => {
        expect(showSpy).toHaveBeenCalledWith(
          expect.objectContaining({ title: 'Error', message: 'Response rejected' })
        );
      },
      { timeout: SAVE_TIMEOUT_MS + 2000 }
    );
    expect(onTaskChange).not.toHaveBeenCalled();
  });
});
