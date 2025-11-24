// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MedplumProvider } from '@medplum/react';
import { MockClient } from '@medplum/mock';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TaskPanel } from './TaskPanel';
import type { Task } from '@medplum/fhirtypes';

// Mock sub-components
vi.mock('./TaskQuestionnaireForm', () => ({
  TaskQuestionnaireForm: () => <div data-testid="task-questionnaire-form">TaskQuestionnaireForm</div>,
}));

vi.mock('./TaskServiceRequest', () => ({
  TaskServiceRequest: () => <div data-testid="task-service-request">TaskServiceRequest</div>,
}));

vi.mock('./SimpleTask', () => ({
  SimpleTask: () => <div data-testid="simple-task">SimpleTask</div>,
}));

vi.mock('./TaskStatusPanel', () => ({
  TaskStatusPanel: ({ onChangeStatus }: { onChangeStatus: (status: string) => void }) => (
    <div data-testid="task-status-panel">
      <button onClick={() => onChangeStatus('completed')}>Complete Task</button>
    </div>
  ),
}));

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
  };

  it('renders TaskQuestionnaireForm when focus is Questionnaire', () => {
    const task: Task = {
      ...mockTask,
      focus: { reference: 'Questionnaire/123' },
    };
    const onUpdateTask = vi.fn();
    setup(task, onUpdateTask);
    expect(screen.getByTestId('task-questionnaire-form')).toBeInTheDocument();
    expect(screen.queryByTestId('task-service-request')).not.toBeInTheDocument();
    expect(screen.queryByTestId('simple-task')).not.toBeInTheDocument();
  });

  it('renders TaskServiceRequest when focus is ServiceRequest', () => {
    const task: Task = {
      ...mockTask,
      focus: { reference: 'ServiceRequest/123' },
    };
    const onUpdateTask = vi.fn();
    setup(task, onUpdateTask);
    expect(screen.getByTestId('task-service-request')).toBeInTheDocument();
    expect(screen.queryByTestId('task-questionnaire-form')).not.toBeInTheDocument();
    expect(screen.queryByTestId('simple-task')).not.toBeInTheDocument();
  });

  it('renders SimpleTask when focus is neither Questionnaire nor ServiceRequest', () => {
    const onUpdateTask = vi.fn();
    setup(mockTask, onUpdateTask);
    expect(screen.getByTestId('simple-task')).toBeInTheDocument();
    expect(screen.queryByTestId('task-questionnaire-form')).not.toBeInTheDocument();
    expect(screen.queryByTestId('task-service-request')).not.toBeInTheDocument();
  });

  it('renders TaskStatusPanel', () => {
    const onUpdateTask = vi.fn();
    setup(mockTask, onUpdateTask);
    expect(screen.getByTestId('task-status-panel')).toBeInTheDocument();
  });

  it('updates task status when changed in TaskStatusPanel', async () => {
    const onUpdateTask = vi.fn();
    setup(mockTask, onUpdateTask);

    const updateResourceSpy = vi.spyOn(medplum, 'updateResource');

    const completeButton = screen.getByText('Complete Task');
    await act(async () => {
      fireEvent.click(completeButton);
    });

    await waitFor(() => {
      expect(updateResourceSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'task-123',
          status: 'completed',
        })
      );
      expect(onUpdateTask).toHaveBeenCalled();
    });
  });
});
