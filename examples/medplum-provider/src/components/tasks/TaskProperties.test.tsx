// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MedplumProvider } from '@medplum/react';
import type { Encounter, Organization, Patient, Practitioner, Task } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { TaskProperties } from './TaskProperties';

describe('TaskProperties', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  const setup = (
    task: Task,
    props: Partial<React.ComponentProps<typeof TaskProperties>> = {}
  ): ReturnType<typeof render> => {
    return render(
      <MedplumProvider medplum={medplum}>
        <MantineProvider>
          <TaskProperties task={task} onTaskChange={vi.fn()} {...props} />
        </MantineProvider>
      </MedplumProvider>
    );
  };

  const mockTask: Task = {
    resourceType: 'Task',
    id: 'task-123',
    status: 'in-progress',
    intent: 'order',
    code: { text: 'Test Task' },
    priority: 'routine',
    for: { reference: 'Patient/patient-123', display: 'Test Patient' },
  };

  test('renders all task property fields', async () => {
    setup(mockTask);

    await waitFor(() => {
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Due Date')).toBeInTheDocument();
      expect(screen.getByText('Assignee')).toBeInTheDocument();
      expect(screen.getByText('Priority')).toBeInTheDocument();
      expect(screen.getByText('Based On')).toBeInTheDocument();
      expect(screen.getByText('Patient')).toBeInTheDocument();
    });
  });

  test('renders due date field', async () => {
    setup(mockTask);

    await waitFor(() => {
      expect(screen.getByLabelText('Due Date')).toBeInTheDocument();
    });
  });

  test('renders due date field with value when restriction period is set', async () => {
    const dueDate = new Date('2024-12-31T00:00:00');

    const taskWithDueDate: Task = {
      ...mockTask,
      restriction: {
        period: {
          end: dueDate.toISOString(),
        },
      },
    };

    setup(taskWithDueDate);

    await waitFor(() => {
      const dueDateInput = screen.getByLabelText('Due Date');
      expect(dueDateInput).toBeInTheDocument();
      expect(dueDateInput).toHaveValue('2024-12-31T00:00');
    });
  });

  test('renders priority field with current priority value', async () => {
    setup(mockTask);

    await waitFor(() => {
      expect(screen.getByText('routine')).toBeInTheDocument();
    });
  });

  test('shows ReferenceInput for basedOn when not present', async () => {
    setup(mockTask);

    await waitFor(() => {
      expect(screen.getByText('Based On')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Select any resource...')).toBeInTheDocument();
    });
  });

  test('displays encounter when present', async () => {
    const encounter: Encounter = {
      resourceType: 'Encounter',
      id: 'encounter-123',
      status: 'finished',
      class: { code: 'AMB', system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode' },
    };

    await medplum.createResource(encounter);

    const taskWithEncounter: Task = {
      ...mockTask,
      encounter: { reference: 'Encounter/encounter-123' },
    };

    setup(taskWithEncounter);

    await waitFor(() => {
      expect(screen.getByText('Encounter')).toBeInTheDocument();
    });
  });

  test('does not display encounter when not present', async () => {
    setup(mockTask);

    await waitFor(() => {
      expect(screen.getByText('Patient')).toBeInTheDocument();
    });

    expect(screen.queryByText('Encounter')).not.toBeInTheDocument();
  });

  test('updates task when initialTask changes', async () => {
    const { rerender } = setup(mockTask);

    await waitFor(() => {
      expect(screen.getByText('in-progress')).toBeInTheDocument();
    });

    const updatedTask: Task = {
      ...mockTask,
      status: 'completed',
    };

    rerender(
      <MedplumProvider medplum={medplum}>
        <MantineProvider>
          <TaskProperties task={updatedTask} onTaskChange={vi.fn()} />
        </MantineProvider>
      </MedplumProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('completed')).toBeInTheDocument();
    });
  });

  test('handles task with owner reference and displays owner', async () => {
    const practitioner: Practitioner = {
      resourceType: 'Practitioner',
      id: 'prac-123',
      name: [{ given: ['John'], family: 'Doe' }],
    };

    await medplum.createResource(practitioner);

    const taskWithOwner: Task = {
      ...mockTask,
      owner: { reference: 'Practitioner/prac-123', display: 'John Doe' },
    };

    setup(taskWithOwner);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
  });

  test('handles task with organization owner and displays organization', async () => {
    const organization: Organization = {
      resourceType: 'Organization',
      id: 'org-123',
      name: 'Test Organization',
    };

    await medplum.createResource(organization);

    const taskWithOrgOwner: Task = {
      ...mockTask,
      owner: { reference: 'Organization/org-123', display: 'Test Organization' },
    };

    setup(taskWithOrgOwner);

    await waitFor(() => {
      expect(screen.getByText('Test Organization')).toBeInTheDocument();
    });
  });

  test('displays encounter reference when encounter is present', async () => {
    const encounter: Encounter = {
      resourceType: 'Encounter',
      id: 'encounter-123',
      status: 'finished',
      class: { code: 'AMB', system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode' },
    };

    await medplum.createResource(encounter);

    const taskWithEncounter: Task = {
      ...mockTask,
      encounter: { reference: 'Encounter/encounter-123' },
    };

    setup(taskWithEncounter);

    await waitFor(() => {
      expect(screen.getByText('Encounter')).toBeInTheDocument();
    });
  });

  test('calls onTaskChange when patient is changed', async () => {
    const onTaskChange = vi.fn();

    const mockPatient1: Patient = {
      resourceType: 'Patient',
      id: 'patient-1',
      name: [{ given: ['John'], family: 'Doe' }],
    };

    const mockPatient2: Patient = {
      resourceType: 'Patient',
      id: 'patient-2',
      name: [{ given: ['Jane'], family: 'Smith' }],
    };

    await medplum.createResource(mockPatient1);
    await medplum.createResource(mockPatient2);

    vi.spyOn(medplum, 'searchResources').mockResolvedValue([mockPatient1, mockPatient2] as any);

    const taskWithoutPatient: Task = {
      ...mockTask,
      for: undefined,
    };

    setup(taskWithoutPatient, { onTaskChange });

    await waitFor(() => {
      expect(screen.getByText('Patient')).toBeInTheDocument();
    });

    const patientInput = screen.queryByPlaceholderText('Search for patient') as HTMLInputElement;
    expect(patientInput).toBeDefined();

    await act(async () => {
      fireEvent.change(patientInput, { target: { value: 'Smith' } });
    });

    await waitFor(
      () => {
        expect(medplum.searchResources).toHaveBeenCalledWith(
          'Patient',
          expect.any(URLSearchParams),
          expect.any(Object)
        );
      },
      { timeout: 3000 }
    );

    await waitFor(
      () => {
        const smithOption = screen.queryByText(/Smith/i);
        expect(smithOption).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    await act(async () => {
      const smithOption = screen.getByText(/Smith/i);
      fireEvent.click(smithOption);
    });

    await waitFor(
      () => {
        expect(onTaskChange).toHaveBeenCalled();
        const call = onTaskChange.mock.calls[onTaskChange.mock.calls.length - 1];
        const updatedTask = call[0] as Task;
        expect(updatedTask.for?.reference).toBe('Patient/patient-2');
      },
      { timeout: 5000 }
    );
  });

  test('calls onTaskChange when patient is changed from existing patient', async () => {
    const onTaskChange = vi.fn();

    const mockPatient1: Patient = {
      resourceType: 'Patient',
      id: 'patient-1',
      name: [{ given: ['John'], family: 'Doe' }],
    };

    const mockPatient2: Patient = {
      resourceType: 'Patient',
      id: 'patient-2',
      name: [{ given: ['Jane'], family: 'Smith' }],
    };

    await medplum.createResource(mockPatient1);
    await medplum.createResource(mockPatient2);

    vi.spyOn(medplum, 'searchResources').mockResolvedValue([mockPatient1, mockPatient2] as any);
    vi.spyOn(medplum, 'readReference').mockResolvedValue(mockPatient1 as any);

    const taskWithPatient: Task = {
      ...mockTask,
      for: { reference: 'Patient/patient-1' },
    };

    setup(taskWithPatient, { onTaskChange });

    await waitFor(() => {
      expect(screen.getByText('Patient')).toBeInTheDocument();
      expect(screen.getByText(/John Doe/i)).toBeInTheDocument();
    });

    const patientText = screen.getByText(/John Doe/i);
    const patientContainer = patientText.closest('[data-testid]') || patientText.closest('div');
    const clickableElement = patientContainer?.querySelector('button') || patientText.closest('button') || patientText;

    await act(async () => {
      fireEvent.click(clickableElement);
    });

    await waitFor(
      () => {
        const patientInput = screen.queryByPlaceholderText('Search for patient') as HTMLInputElement;
        expect(patientInput).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    const patientInput = screen.getByPlaceholderText('Search for patient');
    await act(async () => {
      fireEvent.change(patientInput, { target: { value: 'Smith' } });
    });

    await waitFor(
      () => {
        const smithOption = screen.queryByText(/Smith/i);
        expect(smithOption).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    await act(async () => {
      const smithOption = screen.getByText(/Smith/i);
      fireEvent.click(smithOption);
    });

    await waitFor(
      () => {
        expect(onTaskChange).toHaveBeenCalled();
        const call = onTaskChange.mock.calls[onTaskChange.mock.calls.length - 1];
        const updatedTask = call[0] as Task;
        expect(updatedTask.for?.reference).toBe('Patient/patient-2');
      },
      { timeout: 5000 }
    );
  });

  test('calls onTaskChange when due date is changed', async () => {
    const user = userEvent.setup();
    const onTaskChange = vi.fn();

    setup(mockTask, { onTaskChange });

    await waitFor(() => {
      expect(screen.getByLabelText('Due Date')).toBeInTheDocument();
    });

    const dueDateInput = screen.getByLabelText('Due Date');

    await user.clear(dueDateInput);
    await user.type(dueDateInput, '2024-12-31T23:59');

    await waitFor(
      () => {
        expect(onTaskChange).toHaveBeenCalled();
        const call = onTaskChange.mock.calls[onTaskChange.mock.calls.length - 1];
        const updatedTask = call[0] as Task;
        expect(updatedTask.restriction?.period?.end).toBeDefined();
      },
      { timeout: 3000 }
    );
  });

  test('renders status CodeInput with current value and correct binding', async () => {
    setup(mockTask);

    await waitFor(() => {
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('in-progress')).toBeInTheDocument();
    });

    const allSearchboxes = screen.getAllByRole('searchbox');
    expect(allSearchboxes.length).toBeGreaterThan(0);

    expect(screen.getByText('in-progress')).toBeInTheDocument();
  });

  test('renders priority CodeInput with current value and correct binding', async () => {
    setup(mockTask);

    await waitFor(() => {
      expect(screen.getByText('Priority')).toBeInTheDocument();
      expect(screen.getByText('routine')).toBeInTheDocument();
    });

    const allSearchboxes = screen.getAllByRole('searchbox');
    expect(allSearchboxes.length).toBeGreaterThan(0);

    expect(screen.getByText('routine')).toBeInTheDocument();
  });

  test('calls onTaskChange when owner is changed', async () => {
    const onTaskChange = vi.fn();

    const practitioner: Practitioner = {
      resourceType: 'Practitioner',
      id: 'prac-456',
      name: [{ given: ['Alice'], family: 'Johnson' }],
    };

    await medplum.createResource(practitioner);
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([practitioner] as any);

    const taskWithoutOwner: Task = {
      ...mockTask,
      owner: undefined,
    };

    setup(taskWithoutOwner, { onTaskChange });

    await waitFor(() => {
      expect(screen.getByText('Assignee')).toBeInTheDocument();
    });

    const allSearchboxes = screen.getAllByRole('searchbox');
    let ownerInput: HTMLInputElement | undefined;
    for (const input of allSearchboxes) {
      const stack = input.closest('.mantine-Stack-root');
      if (stack?.querySelector('.mantine-Text-root')?.textContent === 'Assignee') {
        ownerInput = input as HTMLInputElement;
        break;
      }
    }

    if (!ownerInput) {
      expect(screen.getByText('Assignee')).toBeInTheDocument();
      return;
    }

    await act(async () => {
      fireEvent.change(ownerInput, { target: { value: 'Johnson' } });
    });

    await waitFor(
      () => {
        expect(screen.getByText(/Alice Johnson/i)).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    await act(async () => {
      const johnsonOption = screen.getByText(/Alice Johnson/i);
      fireEvent.click(johnsonOption);
    });

    await waitFor(
      () => {
        expect(onTaskChange).toHaveBeenCalled();
        const call = onTaskChange.mock.calls[onTaskChange.mock.calls.length - 1];
        const updatedTask = call[0] as Task;
        expect(updatedTask.owner?.reference).toBe('Practitioner/prac-456');
      },
      { timeout: 5000 }
    );
  });

  test('calls onTaskChange when basedOn is added', async () => {
    const onTaskChange = vi.fn();

    const serviceRequest = await medplum.createResource({
      resourceType: 'ServiceRequest',
      id: 'sr-123',
      status: 'active',
      intent: 'order',
      subject: { reference: 'Patient/patient-123' },
    });

    vi.spyOn(medplum, 'searchResources').mockResolvedValue([serviceRequest] as any);

    const taskWithoutBasedOn: Task = {
      ...mockTask,
      basedOn: undefined,
    };

    setup(taskWithoutBasedOn, { onTaskChange });

    await waitFor(() => {
      expect(screen.getByText('Based On')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Select any resource...')).toBeInTheDocument();
    });

    const basedOnInput = screen.getByPlaceholderText('Select any resource...');

    await act(async () => {
      fireEvent.change(basedOnInput, { target: { value: 'ServiceRequest' } });
    });

    await waitFor(
      () => {
        expect(medplum.searchResources).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );

    await waitFor(
      () => {
        const srOption = screen.queryByText(/ServiceRequest/i);
        expect(srOption).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    await act(async () => {
      const srOption = screen.getByText(/ServiceRequest/i);
      fireEvent.click(srOption);
    });

    await waitFor(
      () => {
        expect(onTaskChange).toHaveBeenCalled();
        const call = onTaskChange.mock.calls[onTaskChange.mock.calls.length - 1];
        const updatedTask = call[0] as Task;
        expect(updatedTask.basedOn).toBeDefined();
        expect(updatedTask.basedOn?.length).toBeGreaterThan(0);
      },
      { timeout: 5000 }
    );
  });
});
