// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import type { Appointment, Patient, Slot } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import type { RenderResult } from '@testing-library/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { SchedulingAPI } from '../../hooks/useSchedulingResources';
import { showErrorNotification } from '../../utils/notifications';
import { AppointmentDetails } from './AppointmentDetails';

vi.mock('../../utils/notifications');
vi.mock('../../utils/encounter', () => ({
  createEncounter: vi.fn(),
}));

describe('AppointmentDetails', () => {
  let medplum: MockClient;
  const start = '2024-01-15T10:00:00Z';
  const end = '2024-01-15T10:30:00Z';

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  type SetupOptions = {
    appointment: WithId<Appointment>;
    onAppointmentUpdate?: (appointment: WithId<Appointment>) => void;
    schedulingAPI?: Partial<SchedulingAPI>;
  };

  type SetupResult = RenderResult & { schedulingAPI: SchedulingAPI };

  const setup = async (options: SetupOptions): Promise<SetupResult> => {
    const { appointment, onAppointmentUpdate = vi.fn() } = options;
    const schedulingAPI: SchedulingAPI = {
      book: vi.fn(),
      cancel: vi.fn(),
      confirm: vi.fn(),
      find: vi.fn(),
      updateAppointment: vi.fn(),
      ...(options.schedulingAPI ?? {}),
    };

    // AppointmentDetails uses `useResource` to load patient information; wrap the setup
    // in `act` so that async effect is visible in the rendered result.
    let result!: RenderResult;
    await act(async () => {
      result = render(
        <AppointmentDetails
          appointment={appointment}
          schedulingAPI={schedulingAPI}
          onAppointmentUpdate={onAppointmentUpdate}
        />,
        {
          wrapper: ({ children }) => (
            <MemoryRouter>
              <MedplumProvider medplum={medplum}>
                <MantineProvider>
                  <Notifications />
                  {children}
                </MantineProvider>
              </MedplumProvider>
            </MemoryRouter>
          ),
        }
      );
    });
    return { ...result, schedulingAPI };
  };

  const createAppointment = (overrides?: Partial<Appointment>): WithId<Appointment> => ({
    resourceType: 'Appointment',
    id: 'appointment-1',
    status: 'booked',
    start,
    end,
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

      // "Appointment Start" and "Appointment End" are shown as timestamps
      expect(screen.getAllByText(/2024/)).toHaveLength(2);
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

    test('renders Cancel Visit button', async () => {
      const appointment = createAppointment();
      await setup({ appointment });

      expect(screen.getByRole('button', { name: 'Cancel Visit' })).toBeInTheDocument();
    });
  });

  describe('Patient Selection', () => {
    test('calls schedulingAPI.updateAppointment when patient is selected and form submitted', async () => {
      const user = userEvent.setup();
      const onAppointmentUpdate = vi.fn();
      const appointment = createAppointment();

      const updatedAppointment: WithId<Appointment> = {
        ...appointment,
        participant: [
          ...appointment.participant,
          {
            actor: { reference: 'Patient/123', display: 'Homer Simpson' },
            status: 'tentative',
          },
        ],
      };

      const { schedulingAPI } = await setup({
        appointment,
        onAppointmentUpdate,
        schedulingAPI: { updateAppointment: vi.fn().mockResolvedValue(updatedAppointment) },
      });

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

      expect(schedulingAPI.updateAppointment).toHaveBeenCalledWith(
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

      // Verify onAppointmentUpdate callback was called
      expect(onAppointmentUpdate).toHaveBeenCalledWith(updatedAppointment);
    });

    test('does not call schedulingAPI.updateAppointment when no patient is selected', async () => {
      const user = userEvent.setup();
      const onAppointmentUpdate = vi.fn();
      const appointment = createAppointment();

      const { schedulingAPI } = await setup({ appointment, onAppointmentUpdate });

      await user.click(screen.getByRole('button', { name: 'Update Appointment' }));

      expect(schedulingAPI.updateAppointment).not.toHaveBeenCalled();
      expect(onAppointmentUpdate).not.toHaveBeenCalled();
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
      const onAppointmentUpdate = vi.fn();
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

      const { schedulingAPI } = await setup({
        appointment,
        onAppointmentUpdate,
        schedulingAPI: { updateAppointment: vi.fn().mockResolvedValue(appointment) },
      });

      // Select a patient (ResourceInput uses a searchbox role)
      const patientInput = screen.getByRole('searchbox');
      await user.type(patientInput, 'Homer');

      await waitFor(() => {
        expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
      });
      await user.click(screen.getByText('Homer Simpson'));

      await user.click(screen.getByRole('button', { name: 'Update Appointment' }));

      // Verify all original participants are preserved
      expect(schedulingAPI.updateAppointment).toHaveBeenCalledWith(
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

      await setup({ appointment });

      expect(screen.getByRole('button', { name: 'Update Appointment' })).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    test('shows error notification when schedulingAPI.updateAppointment fails', async () => {
      const user = userEvent.setup();
      const onAppointmentUpdate = vi.fn();
      const appointment = createAppointment();

      const updateError = new Error('Network error');

      const { schedulingAPI } = await setup({
        appointment,
        onAppointmentUpdate,
        schedulingAPI: { updateAppointment: vi.fn().mockRejectedValue(updateError) },
      });

      const patientInput = screen.getByRole('searchbox');
      await user.type(patientInput, 'Homer');

      await waitFor(() => {
        expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
      });
      await user.click(screen.getByText('Homer Simpson'));

      await user.click(screen.getByRole('button', { name: 'Update Appointment' }));

      expect(schedulingAPI.updateAppointment).toHaveBeenCalled();
      expect(onAppointmentUpdate).not.toHaveBeenCalled();
      expect(showErrorNotification).toHaveBeenCalledWith(updateError);
    });
  });

  describe('Set Up Encounter', () => {
    let patient: WithId<Patient>;

    beforeEach(async () => {
      patient = await medplum.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Jane'], family: 'Doe' }],
      });
    });

    const createAppointmentWithPatient = (patientId: string): WithId<Appointment> => ({
      resourceType: 'Appointment',
      id: 'appointment-with-patient',
      status: 'booked',
      start: '2024-01-15T10:00:00Z',
      end: '2024-01-15T10:30:00Z',
      participant: [
        {
          actor: { reference: `Patient/${patientId}`, display: 'Jane Doe' },
          status: 'accepted',
        },
        {
          actor: { reference: `Practitioner/practitioner-1`, display: 'Dr. Smith' },
          status: 'accepted',
        },
      ],
    });

    test('renders Set Up Encounter section when patient participant is loaded', async () => {
      const appointment = createAppointmentWithPatient(patient.id);
      await setup({ appointment });

      await waitFor(() => {
        expect(screen.getByText('Set Up Encounter')).toBeInTheDocument();
        expect(screen.getByLabelText(/Encounter Class/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Care template/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument();
      });
    });

    test('does not render Set Up Encounter section when there is no patient participant', async () => {
      const appointment = createAppointment();
      await setup({ appointment });

      await waitFor(() => {
        expect(screen.queryByText('Set Up Encounter')).not.toBeInTheDocument();
      });
    });

    test('renders patient name when patient participant is loaded', async () => {
      const appointment = createAppointmentWithPatient(patient.id);
      await setup({ appointment });

      await waitFor(() => {
        expect(screen.getByText('Jane Doe')).toBeInTheDocument();
      });
    });
  });

  test('Cancel Visit button', async () => {
    const user = userEvent.setup();
    const appointment = createAppointment();
    const cancelledAppointment: WithId<Appointment> = { ...appointment, status: 'cancelled' };
    const onAppointmentUpdate = vi.fn();

    const cancelResolvers = Promise.withResolvers<WithId<Appointment>>();
    const { rerender, schedulingAPI } = await setup({
      appointment,
      onAppointmentUpdate,
      schedulingAPI: { cancel: vi.fn().mockReturnValue(cancelResolvers.promise) },
    });

    const button = screen.getByRole('button', { name: /Cancel Visit/i });
    await user.click(button);

    await waitFor(() => expect(schedulingAPI.cancel).toHaveBeenCalledWith(appointment));

    // button goes into loading state
    await waitFor(() => expect(button).toHaveAttribute('data-loading'));

    // resolve the promise
    cancelResolvers.resolve(cancelledAppointment);

    // button is no longer loading
    await waitFor(() => expect(button).not.toHaveAttribute('data-loading'));

    // invoked callback
    expect(onAppointmentUpdate).toHaveBeenCalledWith(cancelledAppointment);

    // re-render with cancelled appointment
    await rerender(
      <AppointmentDetails
        appointment={cancelledAppointment}
        schedulingAPI={schedulingAPI}
        onAppointmentUpdate={onAppointmentUpdate}
      />
    );

    // cancel button is disabled
    await waitFor(() => expect(button).toHaveAttribute('data-disabled'));
  });

  test('Uncancellable appointment status', async () => {
    const user = userEvent.setup();
    const appointment = createAppointment();
    const status = 'arrived' as const;
    const arrivedAppointment = { ...appointment, status };
    await setup({ appointment: arrivedAppointment });

    // button is disabled with explanatory tooltip
    const button = screen.getByRole('button', { name: /Cancel Visit/i });
    await waitFor(() => expect(button).toHaveAttribute('data-disabled'));
    await user.hover(button);
    await waitFor(() => screen.getByText(`Can't cancel appointment with status "${status}"`));
  });

  test('Confirm Visit button', async () => {
    const user = userEvent.setup();
    const bookedAppointment = createAppointment();
    const pendingAppointment: WithId<Appointment> = { ...bookedAppointment, status: 'pending' };
    const busySlot: WithId<Slot> = {
      resourceType: 'Slot',
      id: 'slot-1',
      start,
      end,
      status: 'busy',
      schedule: { reference: 'Schedule/abc123' },
    };
    const busyUnavailableSlot: WithId<Slot> = {
      resourceType: 'Slot',
      id: 'slot-2',
      start,
      end,
      status: 'busy-unavailable',
      schedule: { reference: 'Schedule/abc123' },
    };

    const onAppointmentUpdate = vi.fn();
    const confirmResolvers = Promise.withResolvers<{ appointment: WithId<Appointment>; slots: WithId<Slot>[] }>();

    const { rerender, schedulingAPI } = await setup({
      appointment: pendingAppointment,
      onAppointmentUpdate,
      schedulingAPI: { confirm: vi.fn().mockReturnValue(confirmResolvers.promise) },
    });

    const button = screen.getByRole('button', { name: /Confirm Appointment/i });
    await user.click(button);

    await waitFor(() => expect(schedulingAPI.confirm).toHaveBeenCalledWith(pendingAppointment));

    // button goes into loading state
    await waitFor(() => expect(button).toHaveAttribute('data-loading'));

    // resolve the promise
    confirmResolvers.resolve({ appointment: bookedAppointment, slots: [busySlot, busyUnavailableSlot] });

    // button is no longer loading
    await waitFor(() => expect(button).not.toHaveAttribute('data-loading'));

    // onAppointmentUpdate was called with the updated appointment
    expect(onAppointmentUpdate).toHaveBeenCalledWith(bookedAppointment);

    // re-render with booked appointment
    await rerender(
      <AppointmentDetails
        appointment={bookedAppointment}
        schedulingAPI={schedulingAPI}
        onAppointmentUpdate={onAppointmentUpdate}
      />
    );

    // button is not rendered when status is "booked"
    expect(screen.queryByRole('button', { name: 'Confirm Appointment' })).not.toBeInTheDocument();
  });
});
