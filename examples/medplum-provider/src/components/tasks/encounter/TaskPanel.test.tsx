// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MedplumProvider } from '@medplum/react';
import { MockClient } from '@medplum/mock';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { TaskPanel } from './TaskPanel';
import type { ServiceRequest, Task } from '@medplum/fhirtypes';

describe('TaskPanel', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  const setup = (task: Task, onUpdateTask: (task: Task) => void): void => {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <TaskPanel task={task} onUpdateTask={onUpdateTask} />
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
    code: { text: 'Test Task Code' },
    description: 'Test Task Description',
  };

  test('renders TaskQuestionnaireForm when focus is Questionnaire', async () => {
    const task: Task = {
      ...mockTask,
      focus: { reference: 'Questionnaire/123' },
      input: [{ type: { text: 'Questionnaire' }, valueReference: { reference: 'Questionnaire/123' } }],
    };
    const onUpdateTask = vi.fn();
    medplum.readReference = vi.fn().mockResolvedValue({ resourceType: 'Questionnaire', id: '123' });
    setup(task, onUpdateTask);

    await waitFor(() => {
      expect(medplum.readReference).toHaveBeenCalledWith({ reference: 'Questionnaire/123' });
    });
  });

  test('renders TaskServiceRequest when focus is ServiceRequest', async () => {
    const task: Task = {
      ...mockTask,
      focus: { reference: 'ServiceRequest/123' },
      input: [{ type: { text: 'ServiceRequest' }, valueReference: { reference: 'ServiceRequest/123' } }],
    };
    const onUpdateTask = vi.fn();
    const serviceRequest: ServiceRequest = {
      resourceType: 'ServiceRequest',
      id: '123',
      status: 'active',
      code: { text: 'Test Service Request' },
      intent: 'order',
      subject: { reference: 'Patient/123' },
    };
    await medplum.createResource(serviceRequest);
    medplum.readReference = vi.fn().mockResolvedValue(serviceRequest);
    setup(task, onUpdateTask);

    await waitFor(() => {
      expect(screen.getByText('Test Task Code')).toBeInTheDocument();
      expect(screen.getByText(/✅ Order Sent/)).toBeInTheDocument();
    });
  });

  test('renders SimpleTask when focus is neither Questionnaire nor ServiceRequest', () => {
    const onUpdateTask = vi.fn();
    setup(mockTask, onUpdateTask);
    expect(screen.getByText('Test Task Code')).toBeInTheDocument();
    expect(screen.getByText('Test Task Description')).toBeInTheDocument();
  });

  test('renders TaskStatusPanel', () => {
    const onUpdateTask = vi.fn();
    setup(mockTask, onUpdateTask);
    expect(screen.getByText('Task Status:')).toBeInTheDocument();
  });

  test('updates task status when changed in TaskStatusPanel', async () => {
    const user = userEvent.setup();
    const onUpdateTask = vi.fn();
    medplum.updateResource = vi.fn().mockResolvedValue({ ...mockTask, status: 'completed' });
    setup(mockTask, onUpdateTask);

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
});
