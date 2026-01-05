// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { MedplumProvider } from '@medplum/react';
import { MockClient } from '@medplum/mock';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, beforeEach, vi } from 'vitest';
import { TaskListItem } from './TaskListItem';
import type { Task, Patient, Practitioner } from '@medplum/fhirtypes';

describe('TaskListItem', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
  });

  const setup = (task: Task, selectedTask?: Task, getTaskUri?: (task: Task) => string): ReturnType<typeof render> => {
    const defaultGetTaskUri = (t: Task): string => `/Task/${t.id}`;
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <TaskListItem task={task} selectedTask={selectedTask} getTaskUri={getTaskUri ?? defaultGetTaskUri} />
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
    code: { text: 'Test Task' },
    authoredOn: '2023-01-01T12:00:00Z',
  };

  test('renders task details correctly', () => {
    setup(mockTask);
    expect(screen.getByText('Test Task')).toBeInTheDocument();
  });

  test('renders status badge with correct status', () => {
    setup(mockTask);
    expect(screen.getByText('in progress')).toBeInTheDocument();
  });

  test('renders different status values correctly', () => {
    const completedTask: Task = {
      ...mockTask,
      status: 'completed',
    };
    setup(completedTask);
    expect(screen.getByText('completed')).toBeInTheDocument();
  });

  test('renders due date if present', () => {
    const taskWithDueDate: Task = {
      ...mockTask,
      restriction: { period: { end: '2023-02-01' } },
    };
    setup(taskWithDueDate);
    expect(screen.getByText(/Due/)).toBeInTheDocument();
  });

  test('renders patient name if present', async () => {
    const patient: Patient = {
      resourceType: 'Patient',
      id: 'patient-123',
      name: [{ given: ['John'], family: 'Doe' }],
    };
    await medplum.createResource(patient);

    const taskWithPatient: Task = {
      ...mockTask,
      for: { reference: 'Patient/patient-123' },
    };

    setup(taskWithPatient);

    expect(await screen.findByText('For: John Doe')).toBeInTheDocument();
  });

  test('renders assignee name if present', async () => {
    const practitioner: Practitioner = {
      resourceType: 'Practitioner',
      id: 'practitioner-123',
      name: [{ given: ['Jane'], family: 'Smith' }],
    };
    await medplum.createResource(practitioner);

    const taskWithOwner: Task = {
      ...mockTask,
      owner: { reference: 'Practitioner/practitioner-123' },
    };

    setup(taskWithOwner);

    expect(await screen.findByText('Assigned to Jane Smith')).toBeInTheDocument();
  });

  test('highlights selected task', () => {
    setup(mockTask, mockTask);
    expect(screen.getByText('Test Task')).toBeInTheDocument();
  });

  test('uses getTaskUri URL', () => {
    setup(mockTask);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/Task/task-123');
  });

  test('uses custom URL from getTaskUri when provided', () => {
    const getTaskUri = (task: Task): string => {
      return `/Patient/patient-123/Task/${task.id}`;
    };
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <TaskListItem task={mockTask} selectedTask={undefined} getTaskUri={getTaskUri} />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/Patient/patient-123/Task/task-123');
  });

  test('calls getTaskUri with correct task', () => {
    const getTaskUri = vi.fn((task: Task) => `/Custom/${task.id}`);
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <TaskListItem task={mockTask} selectedTask={undefined} getTaskUri={getTaskUri} />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
    expect(getTaskUri).toHaveBeenCalledWith(mockTask);
    expect(getTaskUri).toHaveBeenCalledTimes(1);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/Custom/task-123');
  });
});
