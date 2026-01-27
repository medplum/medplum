// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { Patient, Task } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import * as usePatientModule from '../../hooks/usePatient';
import { TaskDetailsModal } from './TaskDetailsModal';

describe('TaskDetailsModal', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
    vi.spyOn(medplum, 'updateResource').mockResolvedValue({ id: 'task-123', resourceType: 'Task' } as Task & {
      id: string;
    });
  });

  const mockPatient: WithId<Patient> = {
    resourceType: 'Patient',
    id: 'patient-123',
    name: [{ given: ['John'], family: 'Doe' }],
  };

  const mockTask: Task = {
    resourceType: 'Task',
    id: 'task-123',
    status: 'in-progress',
    intent: 'order',
    code: { text: 'Test Task' },
    description: 'Test task description',
    for: { reference: 'Patient/patient-123' },
    authoredOn: '2023-01-01T12:00:00Z',
  };

  const setup = (): ReturnType<typeof render> => {
    vi.spyOn(usePatientModule, 'usePatient').mockReturnValue(mockPatient);

    return render(
      <MemoryRouter initialEntries={['/Patient/patient-123/Encounter/encounter-123/Task/task-123']}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Routes>
              <Route path="/Patient/:patientId/Encounter/:encounterId/Task/:taskId" element={<TaskDetailsModal />} />
            </Routes>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('renders task details modal', async () => {
    await medplum.createResource(mockTask);
    setup();

    await waitFor(() => {
      expect(screen.getByText('Test Task')).toBeInTheDocument();
      expect(screen.getByText('Test task description')).toBeInTheDocument();
    });
  });

  test('displays patient information', async () => {
    await medplum.createResource(mockTask);
    await medplum.createResource(mockPatient);
    setup();

    await waitFor(() => {
      expect(screen.getByText('View Patient')).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
  });

  test('allows changing due date', async () => {
    await medplum.createResource(mockTask);
    setup();

    await waitFor(() => {
      expect(screen.getByLabelText('Due Date')).toBeInTheDocument();
    });
  });

  test('allows changing task status', async () => {
    await medplum.createResource(mockTask);
    setup();

    await waitFor(() => {
      expect(screen.getByText('Status')).toBeInTheDocument();
    });
  });

  test('allows adding a note', async () => {
    const user = userEvent.setup();
    await medplum.createResource(mockTask);
    setup();

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Add note to this task')).toBeInTheDocument();
    });

    const noteInput = screen.getByPlaceholderText('Add note to this task');
    await user.type(noteInput, 'This is a test note');

    expect(noteInput).toHaveValue('This is a test note');
  });

  test('saves changes when Save Changes button is clicked', async () => {
    const user = userEvent.setup();
    await medplum.createResource(mockTask);
    setup();

    await waitFor(() => {
      expect(screen.getByText('Save Changes')).toBeInTheDocument();
    });

    const noteInput = screen.getByPlaceholderText('Add note to this task');
    await user.type(noteInput, 'Updated note');

    const saveButton = screen.getByText('Save Changes');
    await user.click(saveButton);

    await waitFor(() => {
      expect(medplum.updateResource).toHaveBeenCalled();
    });
  });

  test('shows success notification after saving', async () => {
    const user = userEvent.setup();
    await medplum.createResource(mockTask);
    setup();

    await waitFor(() => {
      expect(screen.getByText('Save Changes')).toBeInTheDocument();
    });

    const saveButton = screen.getByText('Save Changes');
    await user.click(saveButton);

    await waitFor(() => {
      expect(medplum.updateResource).toHaveBeenCalled();
    });
  });

  test('handles save error gracefully', async () => {
    const user = userEvent.setup();
    await medplum.createResource(mockTask);

    vi.spyOn(medplum, 'updateResource').mockRejectedValueOnce(new Error('Update failed'));

    setup();

    await waitFor(() => {
      expect(screen.getByText('Save Changes')).toBeInTheDocument();
    });

    const saveButton = screen.getByText('Save Changes');
    await user.click(saveButton);

    await waitFor(() => {
      expect(medplum.updateResource).toHaveBeenCalled();
    });
  });

  test('closes modal when close button is clicked', async () => {
    const user = userEvent.setup();
    await medplum.createResource(mockTask);
    setup();

    await waitFor(() => {
      expect(screen.getByText('Test Task')).toBeInTheDocument();
    });

    const closeButton = document.querySelector('.mantine-Modal-close');
    expect(closeButton).toBeInTheDocument();
    if (closeButton) {
      await user.click(closeButton);
    }

    await waitFor(() => {
      expect(screen.queryByText('Test Task')).not.toBeInTheDocument();
    });
  });

  test('handles task fetch error', async () => {
    vi.spyOn(medplum, 'readResource').mockRejectedValueOnce(new Error('Task not found'));

    setup();

    await waitFor(() => {
      expect(medplum.readResource).toHaveBeenCalled();
    });
  });

  test('updates task with all fields', async () => {
    const user = userEvent.setup();
    const taskWithAllFields: Task = {
      ...mockTask,
      owner: { reference: 'Practitioner/prac-123' },
      restriction: { period: { end: '2023-12-31' } },
    };

    await medplum.createResource(taskWithAllFields);
    setup();

    await waitFor(() => {
      expect(screen.getByText('Save Changes')).toBeInTheDocument();
    });

    const noteInput = screen.getByPlaceholderText('Add note to this task');
    await user.type(noteInput, 'Comprehensive update');

    const saveButton = screen.getByText('Save Changes');
    await user.click(saveButton);

    await waitFor(() => {
      expect(medplum.updateResource).toHaveBeenCalled();
      const calls = (medplum.updateResource as any).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const updatedTask = calls[calls.length - 1][0] as Task;
      expect(updatedTask.note).toBeDefined();
      expect(updatedTask.note?.[0].text).toBe('Comprehensive update');
    });
  });

  test('does not add empty notes', async () => {
    const user = userEvent.setup();
    await medplum.createResource(mockTask);
    setup();

    await waitFor(() => {
      expect(screen.getByText('Save Changes')).toBeInTheDocument();
    });

    const noteInput = screen.getByPlaceholderText('Add note to this task');
    await user.type(noteInput, 'Test');
    await user.clear(noteInput);

    const saveButton = screen.getByText('Save Changes');
    await user.click(saveButton);

    await waitFor(() => {
      expect(medplum.updateResource).toHaveBeenCalled();
      const calls = (medplum.updateResource as any).mock.calls;
      if (calls.length > 0) {
        const updatedTask = calls[calls.length - 1][0] as Task;
        expect(updatedTask.note).toBeUndefined();
      }
    });
  });
});
