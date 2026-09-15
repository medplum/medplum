// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import type { Questionnaire, QuestionnaireResponse, ServiceRequest, Task } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as reactRouter from 'react-router';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { SAVE_TIMEOUT_MS } from '../../../config/constants';
import { TaskPanel } from './TaskPanel';
import type * as TaskServiceRequestModule from './TaskServiceRequest';

const report = vi.hoisted(() => ({ resourceType: 'DiagnosticReport', id: 'dr-1', status: 'final', code: {} }) as const);
vi.mock('./TaskServiceRequest', async (importOriginal) => {
  const actual = await importOriginal<typeof TaskServiceRequestModule>();
  return {
    TaskServiceRequest: (props: React.ComponentProps<typeof actual.TaskServiceRequest>) => (
      <>
        <actual.TaskServiceRequest {...props} />
        <button type="button" aria-label="Save diagnostic report" onClick={() => props.saveDiagnosticReport(report)} />
      </>
    ),
  };
});

describe('TaskPanel', () => {
  let medplum: MockClient;
  let navigateSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
    navigateSpy = vi.fn().mockReturnValue(Promise.resolve());
    vi.spyOn(reactRouter, 'useNavigate').mockReturnValue(navigateSpy as any);
  });

  afterEach(() => vi.restoreAllMocks());

  const setup = async (
    task: WithId<Task>,
    onUpdateTask: (task: WithId<Task>) => void,
    enabled = true
  ): Promise<void> => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/Patient/123/Encounter/456?tab=tasks']}>
          <MedplumProvider medplum={medplum}>
            <MantineProvider>
              <Notifications />
              <Routes>
                <Route
                  path="/Patient/:patientId/Encounter/:encounterId"
                  element={<TaskPanel task={task} onUpdateTask={onUpdateTask} enabled={enabled} />}
                />
                <Route
                  path="/Patient/:patientId/Encounter/:encounterId/Task/:taskId"
                  element={<div>Task Detail Page</div>}
                />
              </Routes>
            </MantineProvider>
          </MedplumProvider>
        </MemoryRouter>
      );
    });
  };

  const mockTask: WithId<Task> = {
    resourceType: 'Task',
    id: 'task-123',
    status: 'in-progress',
    intent: 'order',
    code: { text: 'Test Task Code' },
    description: 'Test Task Description',
  };

  test('renders TaskQuestionnaireForm when focus is Questionnaire', async () => {
    const questionnaireId = `q-${Date.now()}`;
    const questionnaire: Questionnaire = {
      resourceType: 'Questionnaire',
      id: questionnaireId,
      status: 'active',
      item: [{ linkId: 'q1', type: 'string', text: 'Test Question' }],
    };
    await medplum.createResource(questionnaire);

    const task: WithId<Task> = {
      ...mockTask,
      focus: { reference: `Questionnaire/${questionnaireId}` },
      input: [{ type: { text: 'Questionnaire' }, valueReference: { reference: `Questionnaire/${questionnaireId}` } }],
    };
    const onUpdateTask = vi.fn();
    await setup(task, onUpdateTask);

    await waitFor(() => {
      expect(screen.getByText('Task Status:')).toBeInTheDocument();
    });
  });

  test('renders TaskServiceRequest when focus is ServiceRequest', async () => {
    const task: WithId<Task> = {
      ...mockTask,
      focus: { reference: 'ServiceRequest/1234' },
      for: { reference: 'Patient/123' },
      input: [{ type: { text: 'ServiceRequest' }, valueReference: { reference: 'ServiceRequest/123' } }],
    };
    const onUpdateTask = vi.fn();
    const serviceRequest: ServiceRequest = {
      resourceType: 'ServiceRequest',
      id: '1234',
      status: 'active',
      category: [
        { coding: [{ system: 'http://snomed.info/sct', code: '108252007', display: 'Laboratory procedure' }] },
      ],
      code: { text: 'Test Service Request' },
      intent: 'order',
      subject: { reference: 'Patient/123' },
      requisition: { value: 'REQ-123' },
    };
    await medplum.createResource(serviceRequest);
    medplum.readReference = vi.fn().mockResolvedValue(serviceRequest);
    await setup(task, onUpdateTask);

    await waitFor(() => {
      expect(screen.getByText('Test Task Code')).toBeInTheDocument();
      expect(screen.getByText(/✅ Order Sent/)).toBeInTheDocument();
    });
  });

  test('renders SimpleTask when focus is neither Questionnaire nor ServiceRequest', async () => {
    const onUpdateTask = vi.fn();
    await setup(mockTask, onUpdateTask);
    expect(screen.getByText('Test Task Code')).toBeInTheDocument();
    expect(screen.getByText('Test Task Description')).toBeInTheDocument();
  });

  test('renders TaskStatusPanel', async () => {
    const onUpdateTask = vi.fn();
    await setup(mockTask, onUpdateTask);
    expect(screen.getByText('Task Status:')).toBeInTheDocument();
  });

  test('updates task status when changed in TaskStatusPanel', async () => {
    const user = userEvent.setup();
    const onUpdateTask = vi.fn();
    medplum.updateResource = vi.fn().mockResolvedValue({ ...mockTask, status: 'completed' });
    await setup(mockTask, onUpdateTask);

    const statusBadge = screen.getByText('In Progress');
    await user.click(statusBadge);

    await waitFor(() => {
      const completedOption = screen.getByText('Completed');
      expect(completedOption).toBeInTheDocument();
    });

    await user.click(screen.getByText('Completed'));

    await waitFor(() => {
      expect(medplum.updateResource).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'task-123',
          status: 'completed',
        })
      );
      expect(onUpdateTask).toHaveBeenCalled();
    });
  });

  test('renders with edit action button', async () => {
    const onUpdateTask = vi.fn();
    await setup(mockTask, onUpdateTask);

    await waitFor(() => {
      expect(screen.getByText('Test Task Code')).toBeInTheDocument();
    });

    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  test('saves questionnaire response when response changes - update existing', async () => {
    const questionnaire: Questionnaire = {
      resourceType: 'Questionnaire',
      id: 'q-123',
      status: 'active',
      item: [{ linkId: 'q1', type: 'string', text: 'Test Question' }],
    };
    await medplum.createResource(questionnaire);

    const existingResponse: QuestionnaireResponse = {
      resourceType: 'QuestionnaireResponse',
      id: 'qr-456',
      status: 'in-progress',
      questionnaire: 'Questionnaire/q-123',
    };
    await medplum.createResource(existingResponse);

    const task: WithId<Task> = {
      ...mockTask,
      focus: { reference: 'Questionnaire/q-123' },
      output: [
        { type: { text: 'QuestionnaireResponse' }, valueReference: { reference: 'QuestionnaireResponse/qr-456' } },
      ],
    };

    const onUpdateTask = vi.fn();
    await setup(task, onUpdateTask);

    await waitFor(() => {
      expect(screen.getByText('Task Status:')).toBeInTheDocument();
    });
  });

  test('creates new questionnaire response when none exists', async () => {
    const questionnaire: Questionnaire = {
      resourceType: 'Questionnaire',
      id: 'q-new',
      status: 'active',
      item: [{ linkId: 'q1', type: 'string', text: 'Test Question' }],
    };
    await medplum.createResource(questionnaire);

    const task: WithId<Task> = {
      ...mockTask,
      id: 'task-new-qr',
      focus: { reference: 'Questionnaire/q-new' },
    };

    const onUpdateTask = vi.fn();
    await setup(task, onUpdateTask);

    await waitFor(() => {
      expect(screen.getByText('Task Status:')).toBeInTheDocument();
    });
  });

  test('shows error notification when status update fails', async () => {
    const user = userEvent.setup();
    const onUpdateTask = vi.fn();
    medplum.updateResource = vi.fn().mockRejectedValue(new Error('Update failed'));
    await setup(mockTask, onUpdateTask);

    const statusBadge = screen.getByText('In Progress');
    await user.click(statusBadge);

    await waitFor(() => {
      const completedOption = screen.getByText('Completed');
      expect(completedOption).toBeInTheDocument();
    });

    await user.click(screen.getByText('Completed'));

    await waitFor(() => {
      expect(medplum.updateResource).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(medplum.updateResource).toHaveBeenCalled();
    });
  });

  test('renders with enabled=false disables status changes', async () => {
    const onUpdateTask = vi.fn();
    await setup(mockTask, onUpdateTask, false);

    expect(screen.getByText('Test Task Code')).toBeInTheDocument();
    expect(screen.getByText('Task Status:')).toBeInTheDocument();
  });

  test('handles task without focus reference', async () => {
    const taskWithoutFocus: WithId<Task> = {
      resourceType: 'Task',
      id: 'task-no-focus',
      status: 'draft',
      intent: 'order',
      code: { text: 'Simple Task' },
    };

    const onUpdateTask = vi.fn();
    await setup(taskWithoutFocus, onUpdateTask);

    expect(screen.getByText('Simple Task')).toBeInTheDocument();
  });

  test('handles task with undefined focus reference', async () => {
    const taskWithUndefinedFocus: WithId<Task> = {
      resourceType: 'Task',
      id: 'task-undefined-focus',
      status: 'draft',
      intent: 'order',
      code: { text: 'Task with undefined focus' },
      focus: { display: 'Some Display' },
    };

    const onUpdateTask = vi.fn();
    await setup(taskWithUndefinedFocus, onUpdateTask);

    expect(screen.getByText('Task with undefined focus')).toBeInTheDocument();
  });

  const debounced = { timeout: SAVE_TIMEOUT_MS + 2000 };

  const questionnaireFixture: Questionnaire = {
    resourceType: 'Questionnaire',
    id: 'q-panel',
    status: 'active',
    item: [{ linkId: 'q1', type: 'string', text: 'Panel Question' }],
  };

  const questionnaireTask: WithId<Task> = {
    ...mockTask,
    focus: { reference: 'Questionnaire/q-panel' },
    input: [{ type: { text: 'Questionnaire' }, valueReference: { reference: 'Questionnaire/q-panel' } }],
  };

  test('does not render the Edit Task action when disabled', async () => {
    await setup(mockTask, vi.fn(), false);

    expect(screen.queryByLabelText('Edit Task')).not.toBeInTheDocument();
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  test('navigates to the task detail route and keeps the current search when Edit Task is clicked', async () => {
    await setup(mockTask, vi.fn());

    await userEvent.setup().click(screen.getByLabelText('Edit Task'));

    expect(navigateSpy).toHaveBeenCalledWith('Task/task-123?tab=tasks');
  });

  test('logs a failed QuestionnaireResponse save, then creates the response and records it on the task', async () => {
    const user = userEvent.setup();
    await medplum.createResource(questionnaireFixture);
    const createSpy = vi.spyOn(medplum, 'createResource').mockRejectedValueOnce(new Error('Save failed'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onUpdateTask = vi.fn();
    await setup(questionnaireTask, onUpdateTask);

    await user.type(await screen.findByLabelText('Panel Question'), 'A');
    await waitFor(() => expect(consoleError).toHaveBeenCalledWith(new Error('Save failed')), debounced);
    expect(onUpdateTask).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Panel Question'), 'B');
    await waitFor(() => expect(onUpdateTask).toHaveBeenCalled(), debounced);
    expect(onUpdateTask.mock.calls[0][0]).toMatchObject({ output: [{ type: { text: 'QuestionnaireResponse' } }] });
    expect(onUpdateTask.mock.calls[0][0].output[0].valueReference.reference).toMatch(/^QuestionnaireResponse\//);
    expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ resourceType: 'QuestionnaireResponse' }));
  });

  test('records a saved DiagnosticReport on the task output', async () => {
    const onUpdateTask = vi.fn();
    await setup({ ...mockTask, focus: { reference: 'ServiceRequest/sr-report' } }, onUpdateTask);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Save diagnostic report' }));

    await waitFor(() => expect(onUpdateTask).toHaveBeenCalled(), debounced);
    expect(onUpdateTask.mock.calls[0][0]).toMatchObject({ output: [{ type: { text: 'DiagnosticReport' } }] });
    expect(onUpdateTask.mock.calls[0][0].output[0].valueReference.reference).toBe('DiagnosticReport/dr-1');
  });
});
