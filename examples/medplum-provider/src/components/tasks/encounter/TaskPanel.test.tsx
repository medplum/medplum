// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { ServiceRequest, Task } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { TaskPanel } from './TaskPanel';

describe('TaskPanel', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  const setup = (task: WithId<Task>, onUpdateTask: (task: WithId<Task>) => void): void => {
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

  const mockTask: WithId<Task> = {
    resourceType: 'Task',
    id: 'task-123',
    status: 'in-progress',
    intent: 'order',
    code: { text: 'Test Task Code' },
    description: 'Test Task Description',
  };

  test('renders TaskQuestionnaireForm when focus is Questionnaire', async () => {
    const task: WithId<Task> = {
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
    const task: WithId<Task> = {
      ...mockTask,
      focus: { reference: 'ServiceRequest/123' },
      for: { reference: 'Patient/123' },
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
      requisition: { value: 'REQ-123' },
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
