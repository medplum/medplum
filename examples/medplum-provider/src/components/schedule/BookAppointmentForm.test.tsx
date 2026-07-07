// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import type { Appointment, Encounter, HealthcareService, PlanDefinition, Slot } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { SchedulingAPI } from '../../hooks/useSchedulingResources';
import { createEncounter } from '../../utils/encounter';
import { showErrorNotification } from '../../utils/notifications';
import { SchedulingEncounterCodingURI, SchedulingPlanDefinitionURI } from '../../utils/scheduling';
import { BookAppointmentForm } from './BookAppointmentForm';

vi.mock('../../utils/notifications');
vi.mock('../../utils/encounter', () => ({
  createEncounter: vi.fn(),
}));

describe('BookAppointmentForm', () => {
  let medplum: MockClient;

  const start = '2026-02-20T13:00:00Z';
  const end = '2026-02-20T13:30:00Z';
  const appointment: Appointment = {
    resourceType: 'Appointment',
    id: 'appointment-1',
    status: 'proposed',
    start,
    end,
    participant: [],
  };

  const defaultHealthcareService: HealthcareService = {
    resourceType: 'HealthcareService',
    id: 'hcs-1',
  };

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  type SetupOptions = {
    onSuccess?: (result: {
      appointment: Appointment;
      slots: Slot[];
      patient: typeof HomerSimpson;
      encounter: Encounter | undefined;
    }) => void;
    healthcareService?: HealthcareService;
    schedulingAPI?: Partial<SchedulingAPI>;
  };

  const setup = async (options: SetupOptions = {}): Promise<void> => {
    const { onSuccess, healthcareService = defaultHealthcareService } = options;
    const schedulingAPI: SchedulingAPI = {
      book: vi.fn(),
      cancel: vi.fn(),
      confirm: vi.fn(),
      find: vi.fn(),
      updateAppointment: vi.fn(),
      ...(options.schedulingAPI ?? {}),
    };
    await act(async () => {
      render(
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>
            <MantineProvider>
              <Notifications />
              <BookAppointmentForm
                appointment={appointment}
                healthcareService={healthcareService}
                onSuccess={onSuccess}
                schedulingAPI={schedulingAPI}
              />
            </MantineProvider>
          </MedplumProvider>
        </MemoryRouter>
      );
    });
  };

  test('renders patient input and submit button', async () => {
    await setup();

    expect(screen.getByLabelText('Patient *')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Appointment' })).toBeInTheDocument();
  });

  test('displays the appointment time period', async () => {
    await setup();

    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  test('does not call book when no patient is selected', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    const bookMock = vi.fn();

    await setup({ onSuccess, schedulingAPI: { book: bookMock } });

    await user.click(screen.getByRole('button', { name: 'Create Appointment' }));

    expect(bookMock).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  test('calls schedulingAPI.book with booking that includes the selected patient', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();

    const bookedAppointment: WithId<Appointment> = {
      resourceType: 'Appointment',
      id: 'appointment-1',
      status: 'booked',
      start,
      end,
      participant: [],
    };
    const bookMock = vi.fn().mockResolvedValue({
      appointment: bookedAppointment,
      slots: [],
    });

    await setup({ onSuccess, schedulingAPI: { book: bookMock } });

    const patientInput = screen.getByRole('searchbox');
    await user.type(patientInput, 'Homer');

    await waitFor(() => {
      expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Homer Simpson'));

    await user.click(screen.getByRole('button', { name: 'Create Appointment' }));

    await waitFor(() => expect(bookMock).toHaveBeenCalled());

    expect(bookMock).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: 'Appointment',
        participant: expect.arrayContaining([
          expect.objectContaining({
            actor: expect.objectContaining({ reference: `Patient/${HomerSimpson.id}` }),
            status: 'needs-action',
            required: 'required',
          }),
        ]),
      })
    );
  });

  test('calls onSuccess with appointment, slots, patient, and encounter from the response', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();

    const bookedAppointment: WithId<Appointment> = {
      resourceType: 'Appointment',
      id: 'appointment-1',
      status: 'booked',
      start,
      end,
      participant: [],
    };

    const busySlot: WithId<Slot> = {
      resourceType: 'Slot',
      id: 'slot-1',
      status: 'busy',
      start,
      end,
      schedule: { reference: 'Schedule/schedule-1' },
    };

    const bufferAfterSlot: WithId<Slot> = {
      resourceType: 'Slot',
      id: 'slot-2',
      status: 'busy-unavailable',
      start,
      end: '2026-02-01T13:45:00Z',
      schedule: { reference: 'Schedule/schedule-1' },
    };

    const bookMock = vi.fn().mockResolvedValue({
      appointment: bookedAppointment,
      slots: [busySlot, bufferAfterSlot],
    });

    await setup({ onSuccess, schedulingAPI: { book: bookMock } });

    const patientInput = screen.getByRole('searchbox');
    await user.type(patientInput, 'Homer');

    await waitFor(() => {
      expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Homer Simpson'));

    await user.click(screen.getByRole('button', { name: 'Create Appointment' }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith({
        appointment: bookedAppointment,
        slots: [busySlot, bufferAfterSlot],
        patient: HomerSimpson,
        encounter: undefined,
      });
    });
  });

  test('shows error notification when book fails', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    const bookError = new Error('Network error');
    const bookMock = vi.fn().mockRejectedValue(bookError);

    await setup({ onSuccess, schedulingAPI: { book: bookMock } });

    const patientInput = screen.getByRole('searchbox');
    await user.type(patientInput, 'Homer');

    await waitFor(() => {
      expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Homer Simpson'));

    await user.click(screen.getByRole('button', { name: 'Create Appointment' }));

    await waitFor(() => {
      expect(showErrorNotification).toHaveBeenCalledWith(bookError);
    });
    expect(onSuccess).not.toHaveBeenCalled();
  });

  test('shows loading state while booking is in-flight', async () => {
    const user = userEvent.setup();

    const bookResolvers = Promise.withResolvers<{ appointment: WithId<Appointment>; slots: WithId<Slot>[] }>();
    const bookMock = vi.fn().mockReturnValue(bookResolvers.promise);

    await setup({ schedulingAPI: { book: bookMock } });

    const patientInput = screen.getByRole('searchbox');
    await user.type(patientInput, 'Homer');

    await waitFor(() => {
      expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Homer Simpson'));

    await user.click(screen.getByRole('button', { name: 'Create Appointment' }));

    const button = screen.getByRole('button', { name: 'Create Appointment' });
    await waitFor(() => {
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('data-loading', 'true');
    });

    await act(async () => {
      bookResolvers.resolve({
        appointment: {
          resourceType: 'Appointment',
          id: 'appointment-1',
          status: 'booked',
          start,
          end,
          participant: [],
        },
        slots: [],
      });
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create Appointment' })).not.toBeDisabled();
    });
  });

  describe('encounter creation via bookEncounter', () => {
    const planDefinition: WithId<PlanDefinition> = { resourceType: 'PlanDefinition', id: 'pd-1', status: 'active' };

    const healthcareServiceWithEncounter: HealthcareService = {
      resourceType: 'HealthcareService',
      id: 'hcs-with-encounter',
      extension: [
        {
          url: SchedulingPlanDefinitionURI,
          valueReference: { reference: 'PlanDefinition/pd-1' },
        },
        {
          url: SchedulingEncounterCodingURI,
          valueCoding: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB' },
        },
      ],
    };

    const bookedAppointmentWithParticipants: WithId<Appointment> = {
      resourceType: 'Appointment',
      id: 'appointment-1',
      status: 'booked',
      start,
      end,
      participant: [
        { actor: { reference: 'Practitioner/prac-1' }, status: 'accepted' },
        { actor: { reference: `Patient/${HomerSimpson.id}` }, status: 'accepted' },
      ],
    };

    test('creates encounter and passes it to onSuccess when healthcareService has required extensions', async () => {
      const user = userEvent.setup();
      const onSuccess = vi.fn();
      const mockEncounter: Encounter = { resourceType: 'Encounter', id: 'enc-1', status: 'planned', class: {} };

      const bookMock = vi.fn().mockResolvedValue({
        appointment: bookedAppointmentWithParticipants,
        slots: [],
      });
      vi.spyOn(medplum, 'readReference').mockResolvedValue(planDefinition);
      vi.mocked(createEncounter).mockResolvedValue(mockEncounter as Encounter & { id: string });

      await setup({ onSuccess, healthcareService: healthcareServiceWithEncounter, schedulingAPI: { book: bookMock } });

      const patientInput = screen.getByRole('searchbox');
      await user.type(patientInput, 'Homer');
      await waitFor(() => expect(screen.getByText('Homer Simpson')).toBeInTheDocument());
      await user.click(screen.getByText('Homer Simpson'));
      await user.click(screen.getByRole('button', { name: 'Create Appointment' }));

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ encounter: mockEncounter }));
      });
      expect(createEncounter).toHaveBeenCalledWith(
        medplum,
        { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB' },
        { reference: `Patient/${HomerSimpson.id}` },
        planDefinition,
        bookedAppointmentWithParticipants,
        { reference: 'Practitioner/prac-1' }
      );
    });

    test('skips encounter creation when healthcareService has no PlanDefinition extension', async () => {
      const user = userEvent.setup();
      const onSuccess = vi.fn();

      const bookMock = vi.fn().mockResolvedValue({
        appointment: bookedAppointmentWithParticipants,
        slots: [],
      });

      await setup({ onSuccess, healthcareService: defaultHealthcareService, schedulingAPI: { book: bookMock } });

      const patientInput = screen.getByRole('searchbox');
      await user.type(patientInput, 'Homer');
      await waitFor(() => expect(screen.getByText('Homer Simpson')).toBeInTheDocument());
      await user.click(screen.getByText('Homer Simpson'));
      await user.click(screen.getByRole('button', { name: 'Create Appointment' }));

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ encounter: undefined }));
      });
      expect(createEncounter).not.toHaveBeenCalled();
    });

    test('skips encounter creation when healthcareService has no EncounterCoding extension', async () => {
      const user = userEvent.setup();
      const onSuccess = vi.fn();

      const hcsWithoutCoding: HealthcareService = {
        resourceType: 'HealthcareService',
        id: 'hcs-no-coding',
        extension: [{ url: SchedulingPlanDefinitionURI, valueReference: { reference: 'PlanDefinition/pd-1' } }],
      };

      const bookMock = vi.fn().mockResolvedValue({
        appointment: bookedAppointmentWithParticipants,
        slots: [],
      });

      await setup({ onSuccess, healthcareService: hcsWithoutCoding, schedulingAPI: { book: bookMock } });

      const patientInput = screen.getByRole('searchbox');
      await user.type(patientInput, 'Homer');
      await waitFor(() => expect(screen.getByText('Homer Simpson')).toBeInTheDocument());
      await user.click(screen.getByText('Homer Simpson'));
      await user.click(screen.getByRole('button', { name: 'Create Appointment' }));

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ encounter: undefined }));
      });
      expect(createEncounter).not.toHaveBeenCalled();
    });

    test('skips encounter creation when booked appointment has multiple practitioners', async () => {
      const user = userEvent.setup();
      const onSuccess = vi.fn();

      const apptTwoPractitioners: WithId<Appointment> = {
        ...bookedAppointmentWithParticipants,
        participant: [
          { actor: { reference: 'Practitioner/prac-1' }, status: 'accepted' },
          { actor: { reference: 'Practitioner/prac-2' }, status: 'accepted' },
          { actor: { reference: `Patient/${HomerSimpson.id}` }, status: 'accepted' },
        ],
      };

      const bookMock = vi.fn().mockResolvedValue({ appointment: apptTwoPractitioners, slots: [] });
      vi.spyOn(medplum, 'readReference').mockResolvedValue(planDefinition);

      await setup({ onSuccess, healthcareService: healthcareServiceWithEncounter, schedulingAPI: { book: bookMock } });

      const patientInput = screen.getByRole('searchbox');
      await user.type(patientInput, 'Homer');
      await waitFor(() => expect(screen.getByText('Homer Simpson')).toBeInTheDocument());
      await user.click(screen.getByText('Homer Simpson'));
      await user.click(screen.getByRole('button', { name: 'Create Appointment' }));

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ encounter: undefined }));
      });
      expect(createEncounter).not.toHaveBeenCalled();
    });

    test('skips encounter creation when booked appointment has multiple patients', async () => {
      const user = userEvent.setup();
      const onSuccess = vi.fn();

      const apptTwoPatients: WithId<Appointment> = {
        ...bookedAppointmentWithParticipants,
        participant: [
          { actor: { reference: 'Practitioner/prac-1' }, status: 'accepted' },
          { actor: { reference: `Patient/${HomerSimpson.id}` }, status: 'accepted' },
          { actor: { reference: 'Patient/patient-2' }, status: 'accepted' },
        ],
      };

      const bookMock = vi.fn().mockResolvedValue({ appointment: apptTwoPatients, slots: [] });
      vi.spyOn(medplum, 'readReference').mockResolvedValue(planDefinition);

      await setup({ onSuccess, healthcareService: healthcareServiceWithEncounter, schedulingAPI: { book: bookMock } });

      const patientInput = screen.getByRole('searchbox');
      await user.type(patientInput, 'Homer');
      await waitFor(() => expect(screen.getByText('Homer Simpson')).toBeInTheDocument());
      await user.click(screen.getByText('Homer Simpson'));
      await user.click(screen.getByRole('button', { name: 'Create Appointment' }));

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ encounter: undefined }));
      });
      expect(createEncounter).not.toHaveBeenCalled();
    });

    test('swallows encounter creation errors and still calls onSuccess with encounter undefined', async () => {
      const user = userEvent.setup();
      const onSuccess = vi.fn();
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const bookMock = vi.fn().mockResolvedValue({
        appointment: bookedAppointmentWithParticipants,
        slots: [],
      });
      vi.spyOn(medplum, 'readReference').mockResolvedValue(planDefinition);
      vi.mocked(createEncounter).mockRejectedValue(new Error('PlanDefinition $apply failed'));

      await setup({ onSuccess, healthcareService: healthcareServiceWithEncounter, schedulingAPI: { book: bookMock } });

      const patientInput = screen.getByRole('searchbox');
      await user.type(patientInput, 'Homer');
      await waitFor(() => expect(screen.getByText('Homer Simpson')).toBeInTheDocument());
      await user.click(screen.getByText('Homer Simpson'));
      await user.click(screen.getByRole('button', { name: 'Create Appointment' }));

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ encounter: undefined }));
      });
      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });
});
