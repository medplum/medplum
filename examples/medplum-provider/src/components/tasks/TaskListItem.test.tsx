// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { MedplumProvider } from '@medplum/react';
import { MockClient } from '@medplum/mock';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, beforeEach } from 'vitest';
import { TaskListItem } from './TaskListItem';
import type { Task, Patient, Practitioner } from '@medplum/fhirtypes';

describe('TaskListItem', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
  });

  const setup = (task: Task, selectedTask?: Task): ReturnType<typeof render> => {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <TaskListItem task={task} selectedTask={selectedTask} />
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
});
