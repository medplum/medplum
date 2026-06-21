// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import type { Appointment, Bundle, Encounter, HealthcareService, PlanDefinition, Slot } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
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
  };

  const setup = async (options: SetupOptions = {}): Promise<void> => {
    const { onSuccess, healthcareService = defaultHealthcareService } = options;
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

  test('does not call $book when no patient is selected', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    medplum.post = vi.fn();

    await setup({ onSuccess });

    await user.click(screen.getByRole('button', { name: 'Create Appointment' }));

    expect(medplum.post).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  test('calls $book with correct parameters when patient is selected', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();

    const mockBookResponse: Bundle<Appointment | Slot> = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        {
          resource: {
            resourceType: 'Appointment',
            id: 'appointment-1',
            status: 'booked',
            start,
            end,
            participant: [],
          },
        },
        {
          resource: {
            resourceType: 'Slot',
            id: 'slot-1',
            status: 'busy',
            start,
            end,
            schedule: { reference: 'Schedule/schedule-1' },
          },
        },
      ],
    };

    medplum.post = vi.fn().mockResolvedValue(mockBookResponse);

    await setup({ onSuccess });

    // Select a patient via the ResourceInput autocomplete
    const patientInput = screen.getByRole('searchbox');
    await user.type(patientInput, 'Homer');

    await waitFor(() => {
      expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Homer Simpson'));

    // Submit the form
    await user.click(screen.getByRole('button', { name: 'Create Appointment' }));

    // Verify the $book call
    expect(medplum.post).toHaveBeenCalledWith(
      new URL('https://example.com/fhir/R4/Appointment/$book'),
      expect.objectContaining({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'appointment',
            resource: expect.objectContaining({
              resourceType: 'Appointment',
              participant: expect.arrayContaining([
                expect.objectContaining({
                  actor: expect.objectContaining({ reference: `Patient/${HomerSimpson.id}` }),
                  status: 'needs-action',
                  required: 'required',
                }),
              ]),
            }),
          },
        ],
      })
    );
  });

  test('calls onSuccess with appointment, slots, patient, and encounter from the response', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();

    const bookedAppointment: Appointment = {
      resourceType: 'Appointment',
      id: 'appointment-1',
      status: 'booked',
      start,
      end,
      participant: [],
    };

    const busySlot: Slot = {
      resourceType: 'Slot',
      id: 'slot-1',
      status: 'busy',
      start,
      end,
      schedule: { reference: 'Schedule/schedule-1' },
    };

    const bufferAfterSlot: Slot = {
      resourceType: 'Slot',
      id: 'slot-2',
      status: 'busy-unavailable',
      start,
      end: '2026-02-01T13:45:00Z',
      schedule: { reference: 'Schedule/schedule-1' },
    };

    const mockBookResponse: Bundle<Appointment | Slot> = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [{ resource: bookedAppointment }, { resource: busySlot }, { resource: bufferAfterSlot }],
    };

    medplum.post = vi.fn().mockResolvedValue(mockBookResponse);

    await setup({ onSuccess });

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

  test('shows error notification when $book fails', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    const bookError = new Error('Network error');

    medplum.post = vi.fn().mockRejectedValue(bookError);

    await setup({ onSuccess });

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

    // Use a promise we control to keep the booking in-flight
    let resolveBook: (value: Bundle) => void;
    medplum.post = vi.fn().mockImplementation(
      () =>
        new Promise<Bundle>((resolve) => {
          resolveBook = resolve;
        })
    );

    await setup();

    const patientInput = screen.getByRole('searchbox');
    await user.type(patientInput, 'Homer');

    await waitFor(() => {
      expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Homer Simpson'));

    await user.click(screen.getByRole('button', { name: 'Create Appointment' }));

    // While the request is in-flight, the submit button should be disabled with a loading indicator
    const button = screen.getByRole('button', { name: 'Create Appointment' });
    await waitFor(() => {
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('data-loading', 'true');
    });

    // Resolve the booking to clean up
    await act(async () => {
      resolveBook({ resourceType: 'Bundle', type: 'collection', entry: [] });
    });

    // After completion, the button should no longer be loading
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

    // Appointment returned by $book with exactly one practitioner and one patient
    const bookedAppointmentWithParticipants: Appointment = {
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

    const makeBookResponse = (appt: Appointment): Bundle<Appointment | Slot> => ({
      resourceType: 'Bundle',
      type: 'collection',
      entry: [{ resource: appt }],
    });

    test('creates encounter and passes it to onSuccess when healthcareService has required extensions', async () => {
      const user = userEvent.setup();
      const onSuccess = vi.fn();
      const mockEncounter: Encounter = { resourceType: 'Encounter', id: 'enc-1', status: 'planned', class: {} };

      medplum.post = vi.fn().mockResolvedValue(makeBookResponse(bookedAppointmentWithParticipants));
      vi.spyOn(medplum, 'readReference').mockResolvedValue(planDefinition);
      vi.mocked(createEncounter).mockResolvedValue(mockEncounter as Encounter & { id: string });

      await setup({ onSuccess, healthcareService: healthcareServiceWithEncounter });

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

      medplum.post = vi.fn().mockResolvedValue(makeBookResponse(bookedAppointmentWithParticipants));

      await setup({ onSuccess, healthcareService: defaultHealthcareService });

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

      medplum.post = vi.fn().mockResolvedValue(makeBookResponse(bookedAppointmentWithParticipants));

      await setup({ onSuccess, healthcareService: hcsWithoutCoding });

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

      const apptTwoPractitioners: Appointment = {
        ...bookedAppointmentWithParticipants,
        participant: [
          { actor: { reference: 'Practitioner/prac-1' }, status: 'accepted' },
          { actor: { reference: 'Practitioner/prac-2' }, status: 'accepted' },
          { actor: { reference: `Patient/${HomerSimpson.id}` }, status: 'accepted' },
        ],
      };

      medplum.post = vi.fn().mockResolvedValue(makeBookResponse(apptTwoPractitioners));
      vi.spyOn(medplum, 'readReference').mockResolvedValue(planDefinition);

      await setup({ onSuccess, healthcareService: healthcareServiceWithEncounter });

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

      const apptTwoPatients: Appointment = {
        ...bookedAppointmentWithParticipants,
        participant: [
          { actor: { reference: 'Practitioner/prac-1' }, status: 'accepted' },
          { actor: { reference: `Patient/${HomerSimpson.id}` }, status: 'accepted' },
          { actor: { reference: 'Patient/patient-2' }, status: 'accepted' },
        ],
      };

      medplum.post = vi.fn().mockResolvedValue(makeBookResponse(apptTwoPatients));
      vi.spyOn(medplum, 'readReference').mockResolvedValue(planDefinition);

      await setup({ onSuccess, healthcareService: healthcareServiceWithEncounter });

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

      medplum.post = vi.fn().mockResolvedValue(makeBookResponse(bookedAppointmentWithParticipants));
      vi.spyOn(medplum, 'readReference').mockResolvedValue(planDefinition);
      vi.mocked(createEncounter).mockRejectedValue(new Error('PlanDefinition $apply failed'));

      await setup({ onSuccess, healthcareService: healthcareServiceWithEncounter });

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
