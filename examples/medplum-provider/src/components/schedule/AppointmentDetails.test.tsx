// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { Appointment, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createEncounter } from '../../utils/encounter';
import { showErrorNotification } from '../../utils/notifications';
import { AppointmentDetails } from './AppointmentDetails';

vi.mock('../../utils/notifications');
vi.mock('../../utils/encounter', () => ({
  createEncounter: vi.fn(),
}));

describe('AppointmentDetails', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  type SetupOptions = {
    appointment: Appointment;
    onUpdate?: (appointment: Appointment) => void;
  };

  const setup = async (options: SetupOptions): Promise<void> => {
    const { appointment, onUpdate = vi.fn() } = options;

    // AppointmentDetails uses `useResource` to load patient information; wrap the setup
    // in `act` so that async effect is visible in the rendered result.
    await act(async () => {
      return render(
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>
            <MantineProvider>
              <Notifications />
              <AppointmentDetails appointment={appointment} onUpdate={onUpdate} />
            </MantineProvider>
          </MedplumProvider>
        </MemoryRouter>
      );
    });
  };

  const createAppointment = (overrides?: Partial<Appointment>): Appointment => ({
    resourceType: 'Appointment',
    id: 'appointment-1',
    status: 'booked',
    start: '2024-01-15T10:00:00Z',
    end: '2024-01-15T10:30:00Z',
    participant: [
      {
        actor: { reference: 'Practitioner/practitioner-1', display: 'Dr. Smith' },
        status: 'accepted',
      },
    ],
    ...overrides,
  });

  describe('Rendering', () => {
    test('renders appointment time period', async () => {
      const appointment = createAppointment();
      await setup({ appointment });

      // formatPeriod should display the appointment time
      expect(screen.getByText(/2024/)).toBeInTheDocument();
    });

    test('renders patient input when no patient participant exists', async () => {
      const appointment = createAppointment();
      await setup({ appointment });

      expect(screen.getByText('Patient')).toBeInTheDocument();
      expect(screen.getByRole('searchbox')).toBeInTheDocument();
    });

    test('renders patient info when patient participant exists', async () => {
      const appointment = createAppointment({
        participant: [
          {
            actor: { reference: 'Practitioner/practitioner-1', display: 'Dr. Smith' },
            status: 'accepted',
          },
          {
            actor: { reference: 'Patient/123', display: 'Homer Simpson' },
            status: 'tentative',
          },
        ],
      });

      await setup({ appointment });

      // Patient input should not be shown
      expect(screen.queryByLabelText('Patient')).not.toBeInTheDocument();

      // Patient name should be displayed
      expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
    });

    test('renders Update Appointment button', async () => {
      const appointment = createAppointment();

      await setup({ appointment });

      expect(screen.getByRole('button', { name: 'Update Appointment' })).toBeInTheDocument();
    });
  });

  describe('Patient Selection', () => {
    test('calls onUpdate with updated appointment when patient is selected and form submitted', async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn();
      const appointment = createAppointment();

      // Mock updateResource to return the updated appointment
      const updatedAppointment: Appointment = {
        ...appointment,
        participant: [
          ...appointment.participant,
          {
            actor: { reference: 'Patient/123', display: 'Homer Simpson' },
            status: 'tentative',
          },
        ],
      };
      medplum.updateResource = vi.fn().mockResolvedValue(updatedAppointment);

      await setup({ appointment, onUpdate });

      // Type in the patient search input (ResourceInput uses a searchbox role)
      const patientInput = screen.getByRole('searchbox');
      await user.type(patientInput, 'Homer');

      // Wait for and select the patient from autocomplete
      await waitFor(() => {
        expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
      });
      await user.click(screen.getByText('Homer Simpson'));

      // Submit the form
      await user.click(screen.getByRole('button', { name: 'Update Appointment' }));

      // Verify updateResource was called with the correct data
      expect(medplum.updateResource).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceType: 'Appointment',
          id: 'appointment-1',
          participant: expect.arrayContaining([
            expect.objectContaining({
              actor: expect.objectContaining({ reference: 'Patient/123' }),
              status: 'tentative',
            }),
          ]),
        })
      );

      // Verify onUpdate callback was called
      expect(onUpdate).toHaveBeenCalledWith(updatedAppointment);
    });

    test('does not call updateResource when no patient is selected', async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn();
      const appointment = createAppointment();

      medplum.updateResource = vi.fn();

      await setup({ appointment, onUpdate });

      // Submit without selecting a patient
      await user.click(screen.getByRole('button', { name: 'Update Appointment' }));

      // updateResource should not have been called
      expect(medplum.updateResource).not.toHaveBeenCalled();
      expect(onUpdate).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    test('handles appointment with empty participant array', async () => {
      const appointment = createAppointment({
        participant: [],
      });

      await setup({ appointment });

      // Should show patient input since no patient participant exists
      expect(screen.getByText('Patient')).toBeInTheDocument();
      expect(screen.getByRole('searchbox')).toBeInTheDocument();
    });

    test('preserves existing participants when adding patient', async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn();
      const appointment = createAppointment({
        participant: [
          {
            actor: { reference: 'Practitioner/practitioner-1', display: 'Dr. Smith' },
            status: 'accepted',
          },
          {
            actor: { reference: 'Location/location-1', display: 'Room 101' },
            status: 'accepted',
          },
        ],
      });

      medplum.updateResource = vi.fn().mockResolvedValue(appointment);

      await setup({ appointment, onUpdate });

      // Select a patient (ResourceInput uses a searchbox role)
      const patientInput = screen.getByRole('searchbox');
      await user.type(patientInput, 'Homer');

      await waitFor(() => {
        expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
      });
      await user.click(screen.getByText('Homer Simpson'));

      // Submit the form
      await user.click(screen.getByRole('button', { name: 'Update Appointment' }));

      // Verify all original participants are preserved
      expect(medplum.updateResource).toHaveBeenCalledWith(
        expect.objectContaining({
          participant: expect.arrayContaining([
            expect.objectContaining({
              actor: expect.objectContaining({ reference: 'Practitioner/practitioner-1' }),
            }),
            expect.objectContaining({
              actor: expect.objectContaining({ reference: 'Location/location-1' }),
            }),
            expect.objectContaining({
              actor: expect.objectContaining({ reference: 'Patient/123' }),
            }),
          ]),
        })
      );
    });

    test('handles appointment without start/end times gracefully', async () => {
      const appointment = createAppointment({
        start: undefined,
        end: undefined,
      });

      // Should not throw
      await setup({ appointment });

      // Component should still render
      expect(screen.getByRole('button', { name: 'Update Appointment' })).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    test('handles updateResource failure', async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn();
      const appointment = createAppointment();

      const updateError = new Error('Network error');

      medplum.updateResource = vi.fn().mockRejectedValue(updateError);

      await setup({ appointment, onUpdate });

      // Select a patient (ResourceInput uses a searchbox role)
      const patientInput = screen.getByRole('searchbox');
      await user.type(patientInput, 'Homer');

      await waitFor(() => {
        expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
      });
      await user.click(screen.getByText('Homer Simpson'));

      // Submit the form - this will cause an unhandled rejection
      await user.click(screen.getByRole('button', { name: 'Update Appointment' }));

      // onUpdate should not have been called since the request failed
      expect(medplum.updateResource).toHaveBeenCalled();
      expect(onUpdate).not.toHaveBeenCalled();

      expect(showErrorNotification).toHaveBeenCalledWith(updateError);
    });
  });

  describe('Set Up Encounter', () => {
    let patient: Patient;

    beforeEach(async () => {
      patient = await medplum.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Jane'], family: 'Doe' }],
      });
    });

    const createAppointmentWithPatient = (patientId: string): Appointment => ({
      resourceType: 'Appointment',
      id: 'appointment-with-patient',
      status: 'booked',
      start: '2024-01-15T10:00:00Z',
      end: '2024-01-15T10:30:00Z',
      participant: [
        {
          actor: { reference: `Patient/${patientId}` },
          status: 'accepted',
        },
      ],
    });

    test('renders Set Up Encounter section when patient participant is loaded', async () => {
      const appointment = createAppointmentWithPatient(patient.id as string);
      await setup({ appointment });

      await waitFor(() => {
        expect(screen.getByText('Set Up Encounter')).toBeInTheDocument();
        expect(screen.getByLabelText(/Encounter Class/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Care template/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument();
      });
    });

    test('does not render Set Up Encounter section when there is no patient participant', async () => {
      const appointment = createAppointment(); // no Patient participant
      await setup({ appointment });

      await waitFor(() => {
        expect(screen.queryByText('Set Up Encounter')).not.toBeInTheDocument();
      });
    });

    test('Apply button is disabled when class and care template are not selected', async () => {
      const appointment = createAppointmentWithPatient(patient.id as string);
      await setup({ appointment });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
      });
    });

    test('shows warning notification when form submitted without required fields filled', async () => {
      const appointment = createAppointmentWithPatient(patient.id as string);
      await setup({ appointment });

      await waitFor(() => {
        expect(screen.getByText('Set Up Encounter')).toBeInTheDocument();
      });

      // Bypass the disabled button by submitting the form directly
      const form = screen.getByText('Set Up Encounter').closest('div')?.querySelector('form');
      expect(form).toBeTruthy();
      await act(async () => {
        fireEvent.submit(form as HTMLFormElement);
      });

      await waitFor(() => {
        expect(screen.getByText('Please fill out required fields.')).toBeInTheDocument();
      });
    });

    test('does not call createEncounter when required fields are not filled', async () => {
      const appointment = createAppointmentWithPatient(patient.id as string);
      await setup({ appointment });

      await waitFor(() => {
        expect(screen.getByText('Set Up Encounter')).toBeInTheDocument();
      });

      // Submit the form without filling either field
      const form = screen.getByText('Set Up Encounter').closest('div')?.querySelector('form');
      expect(form).toBeTruthy();
      await act(async () => {
        fireEvent.submit(form as HTMLFormElement);
      });

      // createEncounter must not have been called
      expect(createEncounter).not.toHaveBeenCalled();
    });

    test('createEncounter failure shows an error message', async () => {
      const user = userEvent.setup();

      // Create a PlanDefinition so ResourceInput can find it (searched by `name`)
      await medplum.createResource({
        resourceType: 'PlanDefinition',
        name: 'Test Plan',
        title: 'Test Plan',
        status: 'active',
      });

      const encounterError = new Error('Failed to create encounter');
      vi.mocked(createEncounter).mockRejectedValue(encounterError);

      const appointment = createAppointmentWithPatient(patient.id as string);
      await setup({ appointment });

      await waitFor(() => {
        expect(screen.getByText('Set Up Encounter')).toBeInTheDocument();
      });

      // Fill in Encounter Class — MockClient's ValueSet expansion returns 'Test Display'
      const classInput = screen.getByLabelText(/Encounter Class/i);
      await user.type(classInput, 'Test');
      await waitFor(() => {
        expect(screen.getByText('Test Display')).toBeInTheDocument();
      });
      await user.click(screen.getByText('Test Display'));

      // Fill in Care template
      const templateInput = screen.getByLabelText(/Care template/i);
      await user.type(templateInput, 'Test Plan');
      await waitFor(() => {
        expect(screen.getByText('Test Plan')).toBeInTheDocument();
      });
      await user.click(screen.getByText('Test Plan'));

      // Wait for the Apply button to become enabled, then submit
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Apply' })).not.toBeDisabled();
      });
      await user.click(screen.getByRole('button', { name: 'Apply' }));

      await waitFor(() => {
        expect(showErrorNotification).toHaveBeenCalledWith(encounterError);
      });
    });

    test('renders patient name when patient participant is loaded', async () => {
      const appointment = createAppointmentWithPatient(patient.id as string);
      await setup({ appointment });

      await waitFor(() => {
        expect(screen.getByText('Jane Doe')).toBeInTheDocument();
      });
    });
  });
});
