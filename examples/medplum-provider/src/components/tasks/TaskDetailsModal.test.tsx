// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MedplumProvider } from '@medplum/react';
import type { Task, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TaskDetailsModal } from './TaskDetailsModal';
import * as usePatientModule from '../../hooks/usePatient';

describe('TaskDetailsModal', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  const mockPatient: Patient = {
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

  it('renders task details modal', async () => {
    await medplum.createResource(mockTask);
    setup();

    await waitFor(() => {
      expect(screen.getByText('Test Task')).toBeInTheDocument();
      expect(screen.getByText('Test task description')).toBeInTheDocument();
    });
  });

  it('displays patient information', async () => {
    await medplum.createResource(mockTask);
    await medplum.createResource(mockPatient);
    setup();

    await waitFor(() => {
      expect(screen.getByText('View Patient')).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
  });

  it('allows changing due date', async () => {
    await medplum.createResource(mockTask);
    setup();

    await waitFor(() => {
      expect(screen.getByLabelText('Due Date')).toBeInTheDocument();
    });
  });

  it('allows changing task status', async () => {
    await medplum.createResource(mockTask);
    setup();

    await waitFor(() => {
      expect(screen.getByLabelText('Status')).toBeInTheDocument();
    });
  });

  it('allows adding a note', async () => {
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

  it('saves changes when Save Changes button is clicked', async () => {
    const user = userEvent.setup();
    await medplum.createResource(mockTask);
    setup();

    await waitFor(() => {
      expect(screen.getByText('Save Changes')).toBeInTheDocument();
    });

    const noteInput = screen.getByPlaceholderText('Add note to this task');
    await user.type(noteInput, 'Updated note');

    const saveButton = screen.getByText('Save Changes');
    await act(async () => {
      await user.click(saveButton);
    });

    await waitFor(() => {
      expect(medplum.updateResource).toHaveBeenCalled();
    });
  });

  it('shows success notification after saving', async () => {
    const user = userEvent.setup();
    await medplum.createResource(mockTask);
    setup();

    await waitFor(() => {
      expect(screen.getByText('Save Changes')).toBeInTheDocument();
    });

    const saveButton = screen.getByText('Save Changes');
    await act(async () => {
      await user.click(saveButton);
    });

    await waitFor(() => {
      expect(screen.getByText('Task updated')).toBeInTheDocument();
    });
  });

  it('handles save error gracefully', async () => {
    const user = userEvent.setup();
    await medplum.createResource(mockTask);

    // Mock updateResource to throw an error
    vi.spyOn(medplum, 'updateResource').mockRejectedValueOnce(new Error('Update failed'));

    setup();

    await waitFor(() => {
      expect(screen.getByText('Save Changes')).toBeInTheDocument();
    });

    const saveButton = screen.getByText('Save Changes');
    await act(async () => {
      await user.click(saveButton);
    });

    await waitFor(() => {
      expect(screen.getByText('Failed to update the task.')).toBeInTheDocument();
    });
  });

  it('closes modal when close button is clicked', async () => {
    const user = userEvent.setup();
    await medplum.createResource(mockTask);
    setup();

    await waitFor(() => {
      expect(screen.getByText('Test Task')).toBeInTheDocument();
    });

    const closeButton = screen.getByLabelText(/close/i);
    await user.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByText('Test Task')).not.toBeInTheDocument();
    });
  });

  it('handles task fetch error', async () => {
    setup();

    await waitFor(() => {
      expect(screen.getByText('Error')).toBeInTheDocument();
    });
  });

  it('updates task with all fields', async () => {
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
    await act(async () => {
      await user.click(saveButton);
    });

    await waitFor(() => {
      const calls = vi.mocked(medplum.updateResource).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const updatedTask = calls[calls.length - 1][0] as Task;
      expect(updatedTask.note).toBeDefined();
      expect(updatedTask.note?.[0].text).toBe('Comprehensive update');
    });
  });

  it('does not add empty notes', async () => {
    const user = userEvent.setup();
    await medplum.createResource(mockTask);
    setup();

    await waitFor(() => {
      expect(screen.getByText('Save Changes')).toBeInTheDocument();
    });

    // Type and then delete the note (leaving it empty)
    const noteInput = screen.getByPlaceholderText('Add note to this task');
    await user.type(noteInput, 'Test');
    await user.clear(noteInput);

    const saveButton = screen.getByText('Save Changes');
    await act(async () => {
      await user.click(saveButton);
    });

    await waitFor(() => {
      const calls = vi.mocked(medplum.updateResource).mock.calls;
      if (calls.length > 0) {
        const updatedTask = calls[calls.length - 1][0] as Task;
        // Note should not be added if it's empty
        expect(updatedTask.note).toBeUndefined();
      }
    });
  });
});
