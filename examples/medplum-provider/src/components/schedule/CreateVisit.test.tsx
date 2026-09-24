// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import { createReference } from '@medplum/core';
import type { Appointment, Patient, Schedule } from '@medplum/fhirtypes';
import { DrAliceSmith, HomerEncounter, HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import type { DateTimeRange } from '@medplum/react-scheduling';
import { act, render, screen, waitFor } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createAppointment, createEncounter } from '../../utils/encounter';
import { CreateVisit } from './CreateVisit';

vi.mock('../../utils/encounter', () => ({ createAppointment: vi.fn(), createEncounter: vi.fn() }));
const practitioner = createReference(DrAliceSmith);
const appointment: WithId<Appointment> = { resourceType: 'Appointment', id: 'a1', status: 'booked', participant: [] };

async function selectPatient(user: UserEvent): Promise<void> {
  await user.type(await screen.findByLabelText(/Patient/i), 'Homer');
  await user.click((await screen.findAllByText('Homer Simpson'))[0]);
}

describe('CreateVisit', () => {
  let medplum: MockClient;
  let mockPatient: Patient;
  let range: DateTimeRange;

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();

    mockPatient = {
      ...HomerSimpson,
      id: 'patient-1',
      name: [{ given: ['Homer'], family: 'Simpson' }],
    };

    const startDate = new Date('2024-01-15T10:00:00Z');
    const endDate = new Date('2024-01-15T10:30:00Z');
    range = {
      start: startDate,
      end: endDate,
    };

    notifications.clean();
    await medplum.createResource(mockPatient);
    medplum.getProfile = vi.fn().mockResolvedValue({
      resourceType: 'Practitioner',
      id: 'practitioner-1',
      name: [{ given: ['Dr.'], family: 'Smith' }],
    });
  });

  const setup = (appointmentSlot?: DateTimeRange, schedule?: Schedule): ReturnType<typeof render> => {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <Routes>
              <Route
                path="/"
                element={
                  <CreateVisit appointmentSlot={appointmentSlot} schedule={schedule} practitioner={practitioner} />
                }
              />
              <Route path="/Patient/:patientId/Encounter/:encounterId" element={<div>Encounter Page</div>} />
            </Routes>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  describe('Rendering', () => {
    test('renders form with all required fields', async () => {
      await act(async () => {
        setup(range);
      });

      await waitFor(() => {
        expect(screen.getByLabelText(/Patient/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Start Time/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/End Time/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Class/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Care template/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Create Visit/i })).toBeInTheDocument();
      });
    });

    test('renders without date/time when appointmentSlot is not provided', async () => {
      await act(async () => {
        setup(undefined);
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Create Visit/i })).toBeInTheDocument();
      });
    });

    test('renders correctly when schedule prop is provided', async () => {
      const schedule: Schedule = {
        resourceType: 'Schedule',
        id: 'sched-1',
        actor: [{ reference: 'Practitioner/practitioner-1' }],
      };
      await act(async () => {
        setup(range, schedule);
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Create Visit/i })).toBeInTheDocument();
        expect(screen.getByLabelText(/Patient/i)).toBeInTheDocument();
      });
    });
  });

  describe('Form Validation', () => {
    test('shows error notification when submitting with missing required fields', async () => {
      const user = userEvent.setup();
      await act(async () => {
        setup(range);
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Create Visit/i })).toBeInTheDocument();
      });

      const submitButton = screen.getByRole('button', { name: /Create Visit/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Please fill out required fields/i)).toBeInTheDocument();
      });
    });

    test('does not proceed with submission when required fields are missing', async () => {
      const user = userEvent.setup();
      await act(async () => {
        setup(range);
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Create Visit/i })).toBeInTheDocument();
      });

      const submitButton = screen.getByRole('button', { name: /Create Visit/i });
      await user.click(submitButton);

      await waitFor(() => {
        const notifications = screen.getAllByText(/Please fill out required fields/i);
        expect(notifications.length).toBeGreaterThan(0);
      });
    });

    test('requires a class even when a patient is selected', async () => {
      const user = userEvent.setup();
      setup(range);
      await selectPatient(user);
      await user.click(screen.getByRole('button', { name: /Create Visit/i }));
      expect(await screen.findByText(/Please fill out required fields/i)).toBeInTheDocument();
      expect(createAppointment).not.toHaveBeenCalled();
    });
  });

  describe('PlanDefinition Actions', () => {
    test('does not display included tasks card initially', async () => {
      await act(async () => {
        setup(range);
      });

      await waitFor(() => {
        expect(screen.queryByText(/Included Tasks/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Date/Time Formatting', () => {
    test('updates formatted date/time when appointmentSlot changes', async () => {
      const { rerender } = await act(async () => {
        return setup(range);
      });

      await waitFor(() => {
        expect(screen.getByText(/Jan.*15.*2024/i)).toBeInTheDocument();
      });

      const newSlot: DateTimeRange = {
        start: new Date('2024-02-20T14:00:00Z'),
        end: new Date('2024-02-20T14:30:00Z'),
      };

      await act(async () => {
        rerender(
          <MemoryRouter>
            <MedplumProvider medplum={medplum}>
              <MantineProvider>
                <Notifications />
                <CreateVisit appointmentSlot={newSlot} practitioner={createReference(DrAliceSmith)} />
              </MantineProvider>
            </MedplumProvider>
          </MemoryRouter>
        );
      });

      await waitFor(() => {
        expect(screen.getByText(/Feb.*20.*2024/i)).toBeInTheDocument();
      });
    });
  });

  describe('Button State', () => {
    test('submit button is initially enabled', async () => {
      await act(async () => {
        setup(range);
      });

      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: /Create Visit/i });
        expect(submitButton).toBeInTheDocument();
        expect(submitButton).not.toBeDisabled();
      });
    });
  });

  describe('Form Field Changes', () => {
    test('updates patient when patient is selected', async () => {
      await act(async () => {
        setup(range);
      });

      const patientInput = await screen.findByLabelText(/Patient/i);
      expect(patientInput).toBeInTheDocument();
    });

    test('updates start time when changed', async () => {
      const user = userEvent.setup();
      await act(async () => {
        setup(range);
      });

      await waitFor(() => {
        expect(screen.getByLabelText(/Start Time/i)).toBeInTheDocument();
      });

      const startInput = screen.getByLabelText(/Start Time/i);
      await act(async () => {
        await user.clear(startInput);
        await user.type(startInput, '2024-01-15T11:00');
      });

      expect(startInput).toHaveValue('2024-01-15T11:00');
    });

    test('updates end time when changed', async () => {
      const user = userEvent.setup();
      await act(async () => {
        setup(range);
      });

      const endInput = await screen.findByLabelText(/End Time/i);
      await act(async () => {
        await user.clear(endInput);
        await user.type(endInput, '2024-01-15T12:00');
      });

      expect(endInput).toHaveValue('2024-01-15T12:00');
    });

    test('updates class when class is selected', async () => {
      const user = userEvent.setup();
      await act(async () => {
        setup(range);
      });

      const classInput = await screen.findByLabelText(/Class/i);
      await user.click(classInput);

      expect(classInput).toBeInTheDocument();
    });

    test('updates care template when template is selected', async () => {
      await act(async () => {
        setup(range);
      });

      const templateInput = await screen.findByLabelText(/Care template/i);
      expect(templateInput).toBeInTheDocument();
    });
  });

  describe('Submission', () => {
    const setupFilled = async (user: UserEvent): Promise<void> => {
      vi.mocked(createAppointment).mockResolvedValue(appointment);
      vi.mocked(createEncounter).mockResolvedValue(HomerEncounter as WithId<typeof HomerEncounter>);
      setup(range);
      await selectPatient(user);
      await user.type(screen.getByLabelText(/Class/i), 'Test');
      await user.click(await screen.findByText('Test Display'));
    };

    test('creates the appointment and encounter, then navigates to the new encounter', async () => {
      const user = userEvent.setup();
      await setupFilled(user);
      await user.click(screen.getByRole('button', { name: /Create Visit/i }));
      expect(await screen.findByText('Visit created')).toBeInTheDocument();
      expect(await screen.findByText('Encounter Page')).toBeInTheDocument();
      const patient = expect.objectContaining({ resourceType: 'Patient' });
      const coding = expect.objectContaining({ code: 'test-code' });
      expect(createAppointment).toHaveBeenCalledWith(medplum, range.start, range.end, patient, practitioner, undefined);
      expect(createEncounter).toHaveBeenCalledWith(medplum, coding, patient, undefined, appointment, practitioner);
    });

    test('shows an error notification and re-enables the button when creation fails', async () => {
      const user = userEvent.setup();
      await setupFilled(user);
      vi.mocked(createAppointment).mockRejectedValue(new Error('Slot already booked'));
      await user.click(screen.getByRole('button', { name: /Create Visit/i }));
      expect(await screen.findByText('Slot already booked')).toBeInTheDocument();
      expect(createEncounter).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: /Create Visit/i })).not.toBeDisabled();
    });
  });

  describe('Plan Definition Actions', () => {
    test('displays included tasks when plan definition has actions', async () => {
      const planDefinition: any = {
        resourceType: 'PlanDefinition',
        id: 'plan-1',
        status: 'active',
        action: [
          { id: 'action-1', title: 'Task 1' },
          { id: 'action-2', title: 'Task 2' },
        ],
      };
      await medplum.createResource(planDefinition);

      await act(async () => {
        setup(range);
      });

      const templateInput = await screen.findByLabelText(/Care template/i);
      expect(templateInput).toBeInTheDocument();
    });
  });
});
