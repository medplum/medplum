// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { render, screen, waitFor } from '@testing-library/react';
import { MedplumProvider } from '@medplum/react';
import { MockClient } from '@medplum/mock';
import { MemoryRouter, Routes, Route } from 'react-router';
import { describe, expect, test, beforeEach, vi } from 'vitest';
import { TasksTab } from './TasksTab';
import type { Task } from '@medplum/fhirtypes';

describe('TasksTab', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  const setup = (initialPath = '/Patient/patient-123/Task'): ReturnType<typeof render> => {
    return render(
      <MemoryRouter initialEntries={[initialPath]}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Routes>
              <Route path="/Patient/:patientId/Task" element={<TasksTab />} />
              <Route path="/Patient/:patientId/Task/:taskId" element={<TasksTab />} />
            </Routes>
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
    for: { reference: 'Patient/patient-123' },
  };

  test('renders TaskBoard component', async () => {
    setup();

    await waitFor(() => {
      expect(screen.getByText('My Tasks')).toBeInTheDocument();
    });
  });

  test('filters tasks by patient ID', async () => {
    await medplum.createResource(mockTask);
    const searchSpy = vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 1,
      entry: [{ resource: mockTask }],
    } as any);

    setup();

    await waitFor(() => {
      expect(searchSpy).toHaveBeenCalled();
    });

    const callArgs = searchSpy.mock.calls[0];
    expect(callArgs[0]).toBe('Task');
    expect(callArgs[1]).toContain('patient=Patient%2Fpatient-123');
    expect(callArgs[1]).toContain('_sort=-_lastUpdated');
  });

  test('displays tasks for the patient', async () => {
    await medplum.createResource(mockTask);
    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 1,
      entry: [{ resource: mockTask }],
    } as any);

    setup();

    await waitFor(
      () => {
        expect(screen.getByText('Test Task')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  test('uses patient-specific URL for task navigation', async () => {
    await medplum.createResource(mockTask);
    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 1,
      entry: [{ resource: mockTask }],
    } as any);

    setup();

    await waitFor(() => {
      expect(screen.getByText('Test Task')).toBeInTheDocument();
    });

    const links = screen.getAllByRole('link');
    const taskLink = links.find((link) => link.getAttribute('href')?.includes('/Patient/patient-123/Task/task-123'));
    expect(taskLink).toBeDefined();
    // getTaskUri includes the query string, so check that href starts with the expected path
    expect(taskLink?.getAttribute('href')).toMatch(/^\/Patient\/patient-123\/Task\/task-123/);
  });

  test('handles selected task from URL parameter', async () => {
    await medplum.createResource(mockTask);
    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 1,
      entry: [{ resource: mockTask }],
    } as any);
    vi.spyOn(medplum, 'readResource').mockResolvedValue(mockTask as any);

    setup(
      '/Patient/patient-123/Task/task-123?_sort=-_lastUpdated&_count=20&_total=accurate&patient=Patient%2Fpatient-123'
    );

    await waitFor(
      () => {
        expect(medplum.readResource).toHaveBeenCalledWith('Task', 'task-123');
      },
      { timeout: 3000 }
    );

    await waitFor(
      () => {
        expect(screen.getByText('Properties')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  test('handles different patient IDs', async () => {
    const taskForDifferentPatient: Task = {
      ...mockTask,
      id: 'task-456',
      for: { reference: 'Patient/patient-456' },
    };
    await medplum.createResource(taskForDifferentPatient);
    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 1,
      entry: [{ resource: taskForDifferentPatient }],
    } as any);

    setup('/Patient/patient-456/Task?_sort=-_lastUpdated&_count=20&_total=accurate&patient=Patient%2Fpatient-456');

    await waitFor(() => {
      expect(screen.getByText('Test Task')).toBeInTheDocument();
    });

    const links = screen.getAllByRole('link');
    const taskLink = links.find((link) => link.getAttribute('href')?.includes('/Patient/patient-456/Task/task-456'));
    expect(taskLink).toBeDefined();
    // getTaskUri includes the query string, so check that href starts with the expected path
    expect(taskLink?.getAttribute('href')).toMatch(/^\/Patient\/patient-456\/Task\/task-456/);
  });

  test('shows empty state when no tasks found', async () => {
    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 0,
      entry: [],
    } as any);

    setup();

    await waitFor(() => {
      expect(screen.getByText('No tasks available.')).toBeInTheDocument();
    });
  });
});
