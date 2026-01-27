// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { Patient, Task } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { TaskDetailPanel } from './TaskDetailPanel';

const mockTask: WithId<Task> = {
  resourceType: 'Task',
  id: 'task-123',
  status: 'in-progress',
  intent: 'order',
  description: 'Test task description',
  for: {
    reference: 'Patient/patient-123',
    display: 'Test Patient',
  },
  code: {
    text: 'Test Task',
  },
};

const mockPatient: WithId<Patient> = {
  resourceType: 'Patient',
  id: 'patient-123',
  name: [{ given: ['Test'], family: 'Patient' }],
  gender: 'male',
  birthDate: '1990-01-01',
};

describe('TaskDetailPanel', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  const setup = (props: Partial<Parameters<typeof TaskDetailPanel>[0]> = {}): ReturnType<typeof render> => {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <TaskDetailPanel task={mockTask} {...props} />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('no task selected', async () => {
    medplum.readResource = vi.fn().mockRejectedValue(new Error('Not found'));

    setup({ task: { reference: 'Task/non-existent' } });

    await waitFor(() => {
      expect(screen.getByText('No task selected')).toBeInTheDocument();
    });
    expect(screen.queryByText('Properties')).not.toBeInTheDocument();
  });

  test('renders task detail with task object', async () => {
    setup();

    await waitFor(
      () => {
        expect(screen.getByText('Properties')).toBeInTheDocument();
        expect(screen.getByText('Activity Log')).toBeInTheDocument();
        if (mockTask.code?.text) {
          expect(screen.getByText(mockTask.code.text)).toBeInTheDocument();
        }
        if (mockTask.description) {
          expect(screen.getByText(mockTask.description)).toBeInTheDocument();
        }
      },
      { timeout: 3000 }
    );
  });

  test('renders task detail with task reference', async () => {
    medplum.readResource = vi.fn().mockResolvedValue(mockTask);

    await act(async () => {
      setup({ task: { reference: 'Task/task-123' } });
    });

    await waitFor(() => {
      expect(medplum.readResource).toHaveBeenCalled();
      const calls = (medplum.readResource as any).mock.calls;
      expect(calls.some((call: any) => call[0] === 'Task' && call[1] === 'task-123')).toBe(true);
      expect(screen.getByText('Properties')).toBeInTheDocument();
    });
  });

  test('shows patient summary tab when patient exists', async () => {
    medplum.readResource = vi.fn().mockImplementation((resourceType: string, id: string) => {
      if (resourceType === 'Patient' && id === 'patient-123') {
        return Promise.resolve(mockPatient);
      }
      return Promise.resolve(mockTask);
    });

    await act(async () => {
      setup();
    });

    await waitFor(() => {
      expect(screen.getByText('Patient Summary')).toBeInTheDocument();
    });
  });

  test('does not show patient summary tab when no patient', async () => {
    const taskWithoutPatient = { ...mockTask, for: undefined };

    await act(async () => {
      setup({ task: taskWithoutPatient });
    });

    await waitFor(() => {
      expect(screen.queryByText('Patient Summary')).not.toBeInTheDocument();
    });
  });

  test('switches between tabs', async () => {
    const user = userEvent.setup();
    medplum.readResource = vi.fn().mockResolvedValue(mockPatient);
    medplum.readHistory = vi.fn().mockResolvedValue({ resourceType: 'Bundle', entry: [] });

    await act(async () => {
      setup();
    });

    await waitFor(() => {
      expect(screen.getByText('Properties')).toBeInTheDocument();
    });

    const activityLogTab = screen.getByText('Activity Log');
    await user.click(activityLogTab);

    await waitFor(() => {
      expect(medplum.readHistory).toHaveBeenCalledWith('Task', 'task-123');
    });

    await waitFor(() => {
      expect(screen.getByText('Patient Summary')).toBeInTheDocument();
    });

    const patientSummaryTab = screen.getByText('Patient Summary');
    await user.click(patientSummaryTab);

    await waitFor(() => {
      expect(medplum.readResource).toHaveBeenCalled();
      const calls = (medplum.readResource as any).mock.calls;
      expect(calls.some((call: any) => call[0] === 'Patient' && call[1] === 'patient-123')).toBe(true);
    });
  });

  test('renders task detail panel with onTaskChange callback', async () => {
    const onTaskChange = vi.fn();

    await act(async () => {
      setup({ onTaskChange });
    });

    await waitFor(() => {
      expect(screen.getByText('Properties')).toBeInTheDocument();
    });
  });

  test('calls onDeleteTask after successful deletion', async () => {
    const onDeleteTask = vi.fn();
    medplum.deleteResource = vi.fn().mockResolvedValue({});

    await act(async () => {
      setup({ onDeleteTask });
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Delete Task')).toBeInTheDocument();
    });

    const user = userEvent.setup();
    const deleteButton = screen.getByLabelText('Delete Task');

    await user.click(deleteButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    const dialog = screen.getByRole('dialog');
    const confirmButton = within(dialog).getByRole('button', { name: 'Delete' });

    await user.click(confirmButton);

    await waitFor(() => {
      expect(medplum.deleteResource).toHaveBeenCalledTimes(1);
    });

    expect(medplum.deleteResource).toHaveBeenCalledWith('Task', mockTask.id);
    expect(onDeleteTask).toHaveBeenCalledTimes(1);
    expect(onDeleteTask).toHaveBeenCalledWith(mockTask);
  });

  test('shows error notification on delete failure', async () => {
    const onDeleteTask = vi.fn();
    const error = new Error('Delete failed');
    medplum.deleteResource = vi.fn().mockRejectedValue(error);

    await act(async () => {
      setup({ onDeleteTask });
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Delete Task')).toBeInTheDocument();
    });

    const user = userEvent.setup();
    const deleteButton = screen.getByLabelText('Delete Task');

    await user.click(deleteButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    const dialog = screen.getByRole('dialog');
    const confirmButton = within(dialog).getByRole('button', { name: 'Delete' });

    await user.click(confirmButton);

    await waitFor(() => {
      expect(medplum.deleteResource).toHaveBeenCalledTimes(1);
    });

    expect(onDeleteTask).not.toHaveBeenCalled();
  });

  test('loads patient data when task has patient reference', async () => {
    medplum.readResource = vi.fn().mockImplementation((resourceType: string, id: string) => {
      if (resourceType === 'Patient' && id === 'patient-123') {
        return Promise.resolve(mockPatient);
      }
      return Promise.resolve(mockTask);
    });

    await act(async () => {
      setup();
    });

    await waitFor(() => {
      expect(medplum.readResource).toHaveBeenCalled();
      const calls = (medplum.readResource as any).mock.calls;
      expect(calls.some((call: any) => call[0] === 'Patient' && call[1] === 'patient-123')).toBe(true);
    });
  });

  test('handles task reference properly', async () => {
    const taskReference = { reference: 'Task/task-123' };
    medplum.readResource = vi.fn().mockResolvedValue(mockTask);

    await act(async () => {
      setup({ task: taskReference });
    });

    await waitFor(() => {
      expect(medplum.readResource).toHaveBeenCalled();
      const calls = (medplum.readResource as any).mock.calls;
      expect(calls[0][0]).toBe('Task');
      expect(calls[0][1]).toBe('task-123');
    });
  });
});
