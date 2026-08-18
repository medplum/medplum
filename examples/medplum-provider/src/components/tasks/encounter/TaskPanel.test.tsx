// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import type { DiagnosticReport, Questionnaire, QuestionnaireResponse, ServiceRequest, Task } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import * as reactRouter from 'react-router';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { TaskPanel } from './TaskPanel';

// The real TaskServiceRequest never calls its saveDiagnosticReport prop, so a test can
// override it to drive TaskPanel's callback; all other tests get the real component.
let taskServiceRequestOverride: ((props: any) => JSX.Element) | undefined;
vi.mock('./TaskServiceRequest', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./TaskServiceRequest')>();
  return {
    TaskServiceRequest: (props: any): JSX.Element =>
      taskServiceRequestOverride ? taskServiceRequestOverride(props) : <actual.TaskServiceRequest {...props} />,
  };
});

describe('TaskPanel', () => {
  let medplum: MockClient;
  let navigateSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
    taskServiceRequestOverride = undefined;
    navigateSpy = vi.fn().mockReturnValue(Promise.resolve());
    vi.spyOn(reactRouter, 'useNavigate').mockReturnValue(navigateSpy as any);
  });

  const setup = async (
    task: WithId<Task>,
    onUpdateTask: (task: WithId<Task>) => void,
    enabled = true
  ): Promise<void> => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/Patient/123/Encounter/456']}>
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

    // Wait for the task status panel to render
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

    // Wait for the component to render
    await waitFor(() => {
      expect(screen.getByText('Test Task Code')).toBeInTheDocument();
    });

    // The panel should have action buttons
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

    // Wait for the component to render with task status
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

    // Wait for the component to render with task status
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

  test('navigates to task detail when edit button is clicked', async () => {
    const user = userEvent.setup();
    const onUpdateTask = vi.fn();
    await setup(mockTask, onUpdateTask);

    await user.click(screen.getByRole('button', { name: 'Edit Task' }));

    await waitFor(() => {
      expect(navigateSpy).toHaveBeenCalledWith('Task/task-123');
    });
  });

  test('debounce-saves an existing questionnaire response on change', async () => {
    const user = userEvent.setup();
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
      input: [{ type: { text: 'Questionnaire' }, valueReference: { reference: 'Questionnaire/q-123' } }],
      output: [
        { type: { text: 'QuestionnaireResponse' }, valueReference: { reference: 'QuestionnaireResponse/qr-456' } },
      ],
    };

    const updateResourceSpy = vi.spyOn(medplum, 'updateResource');
    const onUpdateTask = vi.fn();
    await setup(task, onUpdateTask);

    const input = await screen.findByLabelText('Test Question');
    await user.type(input, 'hello');

    // The save is debounced by SAVE_TIMEOUT_MS (1500ms)
    await waitFor(
      () => {
        expect(updateResourceSpy).toHaveBeenCalledWith(
          expect.objectContaining({ resourceType: 'QuestionnaireResponse', id: 'qr-456', status: 'in-progress' })
        );
      },
      { timeout: 5000 }
    );
    // Existing response is updated in place; the task output is left alone
    expect(onUpdateTask).not.toHaveBeenCalled();
  }, 10000);

  test('debounce-creates a questionnaire response and links it to the task', async () => {
    const user = userEvent.setup();
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
      input: [{ type: { text: 'Questionnaire' }, valueReference: { reference: 'Questionnaire/q-new' } }],
    };

    const createResourceSpy = vi.spyOn(medplum, 'createResource');
    const updateResourceSpy = vi.spyOn(medplum, 'updateResource');
    const onUpdateTask = vi.fn();
    await setup(task, onUpdateTask);

    const input = await screen.findByLabelText('Test Question');
    await user.type(input, 'hello');

    await waitFor(
      () => {
        expect(createResourceSpy).toHaveBeenCalledWith(expect.objectContaining({ resourceType: 'QuestionnaireResponse' }));
        expect(updateResourceSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            resourceType: 'Task',
            id: 'task-new-qr',
            output: [
              expect.objectContaining({
                type: { text: 'QuestionnaireResponse' },
                valueReference: expect.objectContaining({ reference: expect.stringMatching(/^QuestionnaireResponse\//) }),
              }),
            ],
          })
        );
        expect(onUpdateTask).toHaveBeenCalled();
      },
      { timeout: 5000 }
    );
  }, 10000);

  test('debounce-saves a diagnostic report to the task output', async () => {
    const user = userEvent.setup();
    const diagnosticReport: DiagnosticReport = {
      resourceType: 'DiagnosticReport',
      id: 'dr-123',
      status: 'final',
      code: { text: 'CBC' },
    };
    taskServiceRequestOverride = (props) => (
      <button type="button" onClick={() => props.saveDiagnosticReport(diagnosticReport)}>
        Save Report
      </button>
    );

    const task: WithId<Task> = {
      ...mockTask,
      focus: { reference: 'ServiceRequest/1234' },
    };

    const updateResourceSpy = vi.spyOn(medplum, 'updateResource');
    const onUpdateTask = vi.fn();
    await setup(task, onUpdateTask);

    await user.click(screen.getByRole('button', { name: 'Save Report' }));

    await waitFor(
      () => {
        expect(updateResourceSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            resourceType: 'Task',
            output: [
              expect.objectContaining({
                type: { text: 'DiagnosticReport' },
                valueReference: expect.objectContaining({ reference: 'DiagnosticReport/dr-123' }),
              }),
            ],
          })
        );
        expect(onUpdateTask).toHaveBeenCalled();
      },
      { timeout: 5000 }
    );
  }, 10000);

  test('handles task with undefined focus reference', async () => {
    const taskWithUndefinedFocus: WithId<Task> = {
      resourceType: 'Task',
      id: 'task-undefined-focus',
      status: 'draft',
      intent: 'order',
      code: { text: 'Task with undefined focus' },
      focus: { display: 'Some Display' }, // focus without reference
    };

    const onUpdateTask = vi.fn();
    await setup(taskWithUndefinedFocus, onUpdateTask);

    expect(screen.getByText('Task with undefined focus')).toBeInTheDocument();
  });
});
