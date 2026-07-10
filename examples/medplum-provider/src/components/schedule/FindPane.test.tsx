// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import { ReadablePromise } from '@medplum/core';
import type {
  Appointment,
  CodeableConcept,
  Encounter,
  HealthcareService,
  PlanDefinition,
  Schedule,
  Slot,
} from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createEncounter } from '../../utils/encounter';
import {
  SchedulingEncounterCodingURI,
  SchedulingParametersURI,
  SchedulingPlanDefinitionURI,
} from '../../utils/scheduling';
import { toCodeableReferenceLike } from '../../utils/servicetype';
import { FindPane } from './FindPane';

vi.mock('../../utils/encounter', () => ({ createEncounter: vi.fn() }));
const ServiceTypeReferenceURI = 'https://medlpum.com/fhir/service-type-reference';

describe('FindPane', () => {
  let medplum: MockClient;
  let healthcareService: WithId<HealthcareService>;
  let healthcareService2: WithId<HealthcareService>;

  const createScheduleWithServices = (services: WithId<HealthcareService>[]): WithId<Schedule> => ({
    resourceType: 'Schedule',
    id: 'schedule-1',
    actor: [{ reference: 'Practitioner/practitioner-1' }],
    active: true,
    serviceType: services.flatMap(toCodeableReferenceLike),
  });

  const defaultRange = {
    start: new Date('2024-01-15T00:00:00Z'),
    end: new Date('2024-01-21T23:59:59Z'),
  };

  const mockAppointments: Appointment[] = [
    {
      resourceType: 'Appointment',
      id: 'appointment-1',
      status: 'proposed',
      start: '2024-01-16T10:00:00Z',
      end: '2024-01-16T10:30:00Z',
      participant: [],
    },
    {
      resourceType: 'Appointment',
      id: 'appointment-2',
      status: 'proposed',
      start: '2024-01-16T11:00:00Z',
      end: '2024-01-16T11:30:00Z',
      participant: [],
    },
  ];

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();

    // Mock the $find operation
    const originalGet = medplum.get.bind(medplum);
    medplum.get = vi.fn().mockImplementation((url, options) => {
      if (url.toString().includes('$find')) {
        return new ReadablePromise(
          Promise.resolve({
            resourceType: 'Bundle',
            type: 'searchset',
            entry: mockAppointments.map((appointment) => ({ resource: appointment })),
          })
        );
      }
      return originalGet(url, options);
    });

    healthcareService = await medplum.createResource<HealthcareService>({
      resourceType: 'HealthcareService',
      name: 'Annual Checkup',
      type: [{ coding: [{ system: ServiceTypeReferenceURI, code: 'checkup' }], text: 'Annual Checkup' }],
      extension: [
        { url: SchedulingParametersURI, extension: [{ url: 'duration', valueDuration: { value: 20, unit: 'min' } }] },
      ],
    });

    healthcareService2 = await medplum.createResource<HealthcareService>({
      resourceType: 'HealthcareService',
      name: 'Follow-up Visit',
      type: [{ coding: [{ code: 'followup' }], text: 'Follow-up Visit' }],
      extension: [
        { url: SchedulingParametersURI, extension: [{ url: 'duration', valueDuration: { value: 20, unit: 'min' } }] },
      ],
    });

    await medplum.createResource<HealthcareService>({
      resourceType: 'HealthcareService',
      name: 'Non-schedulable type',
      type: [
        {
          coding: [{ code: 'not-available' }],
        },
      ],
    });
  });

  type SetupOptions = {
    schedule?: WithId<Schedule>;
    range?: { start: Date; end: Date };
    onSuccess?: (results: { appointment: Appointment; slots: Slot[] }) => void;
  };

  const setup = (options: SetupOptions = {}): ReturnType<typeof render> => {
    const {
      schedule = createScheduleWithServices([healthcareService, healthcareService2]),
      range = defaultRange,
      onSuccess = vi.fn(),
    } = options;

    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <div data-testid="FindPaneTestWrapper">
              <FindPane schedule={schedule} range={range} onSuccess={onSuccess} />
            </div>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('it renders null when there are no schedulable service types on the Schedule', async () => {
    // schedule.serviceType is missing, no schedulable services
    const schedule = {
      resourceType: 'Schedule',
      id: 'schedule-123',
      actor: [{ reference: 'Practitioner/practitioner-123' }],
      active: true,
    } satisfies Schedule;

    await act(async () => setup({ schedule }));
    expect(screen.getByTestId('FindPaneTestWrapper')).toBeEmptyDOMElement();
  });

  describe('Initial Rendering', () => {
    test('renders "Schedule..." title when no service type is selected', async () => {
      await act(async () => {
        setup();
      });

      expect(screen.getByText('Schedule…')).toBeInTheDocument();
    });

    test('renders a button for each scheduleable HealthcareService', async () => {
      await act(async () => {
        setup();
      });

      expect(screen.getByText('Annual Checkup')).toBeInTheDocument();
      expect(screen.getByText('Follow-up Visit')).toBeInTheDocument();
    });
  });

  describe('HealthcareService Selection', () => {
    test('fetches appointments when a service type is selected', async () => {
      const user = userEvent.setup();

      await act(async () => {
        setup();
      });

      await user.click(screen.getByText('Annual Checkup'));

      // check that Appointment/$find was called
      expect(medplum.get).toHaveBeenCalledWith(
        expect.objectContaining({ href: expect.stringContaining('Appointment/$find') }),
        expect.any(Object)
      );

      // check that it was called with the service-type-reference parameter
      expect(medplum.get).toHaveBeenCalledWith(
        expect.objectContaining({
          href: expect.stringContaining(
            `service-type-reference=${encodeURIComponent(`HealthcareService/${healthcareService.id}`)}`
          ),
        }),
        expect.any(Object)
      );

      // check that the schedule reference is included
      expect(medplum.get).toHaveBeenCalledWith(
        expect.objectContaining({
          href: expect.stringContaining(`schedule=${encodeURIComponent('Schedule/schedule-1')}`),
        }),
        expect.any(Object)
      );
    });

    test('displays service name after selection', async () => {
      const user = userEvent.setup();

      await act(async () => {
        setup();
      });

      await user.click(screen.getByText('Annual Checkup'));

      expect(screen.getByText('Annual Checkup')).toBeInTheDocument();
      expect(screen.queryByText('Schedule…')).not.toBeInTheDocument();
    });

    test('displays appointment buttons after selection', async () => {
      const user = userEvent.setup();

      await act(async () => {
        setup();
      });

      await user.click(screen.getByText('Annual Checkup'));

      // Appointments should be rendered as buttons with formatted date/time
      const buttons = screen.getAllByRole('button');

      // 1 dismiss button + 2 appointment buttons
      expect(buttons.length).toEqual(3);
    });
  });

  describe('Dismiss Functionality', () => {
    test('shows dismiss button when service type is selected and multiple options exist', async () => {
      const user = userEvent.setup();

      await act(async () => {
        setup();
      });

      await user.click(screen.getByText('Annual Checkup'));

      expect(screen.getByLabelText('Clear selection')).toBeInTheDocument();
    });

    test('clears selection when dismissed', async () => {
      const user = userEvent.setup();

      await act(async () => {
        setup();
      });

      await user.click(screen.getByText('Annual Checkup'));
      expect(screen.getByLabelText('Clear selection')).toBeInTheDocument();

      await user.click(screen.getByLabelText('Clear selection'));

      expect(screen.getByText('Schedule…')).toBeInTheDocument();
    });
  });

  describe('Auto-Selection with Single Service', () => {
    test('auto-selects when there is exactly one schedulable service', async () => {
      const schedule = createScheduleWithServices([healthcareService]);

      await act(async () => {
        setup({ schedule });
      });

      // Should immediately show the service type name, not the selection UI
      expect(screen.getByText('Annual Checkup')).toBeInTheDocument();
      expect(screen.queryByText('Schedule…')).not.toBeInTheDocument();

      // Should fetch slots automatically
      expect(medplum.get).toHaveBeenCalled();
    });

    test('does not show dismiss button when auto-selected with single option', async () => {
      const schedule = createScheduleWithServices([healthcareService]);

      await act(async () => {
        setup({ schedule });
      });

      expect(screen.getByText('Annual Checkup')).toBeInTheDocument();

      // Dismiss button should not be present
      expect(screen.queryByLabelText('Clear selection')).not.toBeInTheDocument();
    });
  });

  describe('Appointment Selection', () => {
    test('Displays a form for the chosen appointment', async () => {
      const user = userEvent.setup();
      const onSuccess = vi.fn();

      await act(async () => {
        setup({ onSuccess });
      });

      // Select a service type first
      await user.click(screen.getByText('Annual Checkup'));

      await waitFor(() => {
        // Find appointment buttons (they contain formatted datetime)
        const appointmentButtons = screen.getAllByRole('button').filter((btn) => btn.textContent?.includes('2024'));
        expect(appointmentButtons.length).toBeGreaterThan(0);
      });

      // Click on an appointment button
      const appointmentButtons = screen.getAllByRole('button').filter((btn) => btn.textContent?.includes('2024'));
      expect(appointmentButtons).not.toHaveLength(0);
      await user.click(appointmentButtons[0]);

      // See creation form become visible
      expect(screen.getByRole('button', { name: 'Create Appointment' })).toBeInTheDocument();

      // Dismissing the form takes us back to the appointment choices
      const dismissButton = screen.getByLabelText('Clear selection');
      expect(dismissButton).toBeInTheDocument();
      await user.click(dismissButton);

      const appointmentButtons2 = screen.getAllByRole('button').filter((btn) => btn.textContent?.includes('2024'));
      expect(appointmentButtons2).not.toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    test('shows error notification when fetch fails', async () => {
      const user = userEvent.setup();

      await act(async () => {
        setup();
      });

      medplum.get = vi.fn().mockRejectedValue(new Error('Network error'));

      await user.click(screen.getByText('Annual Checkup'));
      expect(medplum.get).toHaveBeenCalled();

      // Error notification should be shown
      expect(screen.getByText(/Network error/i)).toBeInTheDocument();
    });
  });

  describe('Search Parameters', () => {
    test('includes start and end dates in API call', async () => {
      const user = userEvent.setup();
      const range = {
        start: new Date('2024-02-01T00:00:00Z'),
        end: new Date('2024-02-07T23:59:59Z'),
      };

      await act(async () => {
        setup({ range });
      });

      await user.click(screen.getByText('Annual Checkup'));

      const callUrl = (medplum.get as ReturnType<typeof vi.fn>).mock.calls
        .map((call) => call[0])
        .find((url) => url.toString().includes('$find'));

      expect(callUrl?.href).toContain('start=');
      expect(callUrl?.href).toContain('end=');
    });
  });

  describe('HealthcareService Integration', () => {
    const healthcareServiceType: CodeableConcept = {
      coding: [{ system: 'http://example.com/service-types', code: 'therapy' }],
      text: 'Therapy Session',
    };

    test('shows service types from HealthcareService resources', async () => {
      const hs = await medplum.createResource<HealthcareService>({
        resourceType: 'HealthcareService',
        type: [healthcareServiceType],
        extension: [{ url: SchedulingParametersURI }],
      });

      const schedule = {
        resourceType: 'Schedule',
        id: 'schedule-123',
        actor: [{ reference: 'Practitioner/practitioner-123' }],
        active: true,
        serviceType: toCodeableReferenceLike(hs),
      } satisfies Schedule;

      await act(async () => setup({ schedule }));

      await waitFor(() => expect(screen.getByText('Therapy Session')).toBeInTheDocument());
    });

    test('ignores HealthcareService resources without scheduling parameters', async () => {
      await medplum.createResource<HealthcareService>({
        resourceType: 'HealthcareService',
        id: 'hs-no-params',
        type: [healthcareServiceType],
        // no SchedulingParameters extension
      });

      const schedule = {
        resourceType: 'Schedule',
        id: 'schedule-123',
        actor: [{ reference: 'Practitioner/practitioner-123' }],
        active: true,
      } satisfies Schedule;

      await act(async () => setup({ schedule }));

      // No scheduling params on the service or schedule, renders null
      await waitFor(() => expect(screen.getByTestId('FindPaneTestWrapper')).toBeEmptyDOMElement());
    });
  });

  describe('Encounter navigation', () => {
    const AMB = { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB' };
    const MOCK_ENCOUNTER: WithId<Encounter> = { resourceType: 'Encounter', id: 'enc-1', status: 'planned', class: AMB };

    let serviceWithEncounterConfig: WithId<HealthcareService>;

    beforeEach(async () => {
      const planDef = await medplum.createResource<PlanDefinition>({
        resourceType: 'PlanDefinition',
        id: 'pd-1',
        status: 'active',
      });

      serviceWithEncounterConfig = await medplum.createResource<HealthcareService>({
        resourceType: 'HealthcareService',
        name: 'Encounter Service',
        extension: [
          { url: SchedulingParametersURI, extension: [{ url: 'duration', valueDuration: { value: 30, unit: 'min' } }] },
          { url: SchedulingEncounterCodingURI, valueCoding: AMB },
          { url: SchedulingPlanDefinitionURI, valueReference: { reference: `PlanDefinition/${planDef.id}` } },
        ],
      });

      // $book returns a booked appointment with exactly one practitioner and one patient so
      // bookEncounter (inside BookAppointmentForm) will proceed to call createEncounter.
      const bookedAppointment: Appointment = {
        resourceType: 'Appointment',
        id: 'booked-1',
        status: 'booked',
        start: '2024-01-16T10:00:00Z',
        end: '2024-01-16T10:30:00Z',
        participant: [
          { actor: { reference: 'Practitioner/prac-1' }, status: 'accepted' },
          { actor: { reference: `Patient/${HomerSimpson.id}` }, status: 'accepted' },
        ],
      };

      medplum.post = vi.fn().mockResolvedValue({
        resourceType: 'Bundle',
        type: 'collection',
        entry: [{ resource: bookedAppointment }],
      });

      vi.mocked(createEncounter).mockResolvedValue(MOCK_ENCOUNTER);
    });

    // Renders FindPane inside a router that has a destination route for the encounter page
    // so tests can assert that navigation actually happened.
    const setupWithRoutes = (schedule: WithId<Schedule>, onSuccess = vi.fn()): void => {
      render(
        <MemoryRouter initialEntries={['/find']}>
          <MedplumProvider medplum={medplum}>
            <MantineProvider>
              <Notifications />
              <Routes>
                <Route
                  path="/find"
                  element={<FindPane schedule={schedule} range={defaultRange} onSuccess={onSuccess} />}
                />
                <Route
                  path="/Patient/:patientId/Encounter/:encounterId"
                  element={<div data-testid="encounter-page" />}
                />
              </Routes>
            </MantineProvider>
          </MedplumProvider>
        </MemoryRouter>
      );
    };

    // Selects a patient and submits BookAppointmentForm.
    const bookWithHomer = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
      const patientInput = await screen.findByRole('searchbox');
      await user.type(patientInput, 'Homer');
      await waitFor(() => expect(screen.getByText('Homer Simpson')).toBeInTheDocument());
      await user.click(screen.getByText('Homer Simpson'));
      await user.click(screen.getByRole('button', { name: 'Create Appointment' }));
    };

    test('navigates to the encounter page and does not call onSuccess when an encounter is returned', async () => {
      const user = userEvent.setup();
      const onSuccess = vi.fn();
      // Single service → auto-selected; $find returns mock appointments from the outer beforeEach.
      setupWithRoutes(createScheduleWithServices([serviceWithEncounterConfig]), onSuccess);

      // Click the first appointment slot that appeared from $find (there are two)
      const apptButtons = await screen.findAllByRole('button', { name: /2024/i });
      await user.click(apptButtons[0]);
      await bookWithHomer(user);

      await waitFor(() => expect(screen.getByTestId('encounter-page')).toBeInTheDocument());
      // handleBookSuccess returns early after navigate, so onSuccess is never called
      expect(onSuccess).not.toHaveBeenCalled();
    });

    test('calls onSuccess and does not navigate when no encounter is returned', async () => {
      const user = userEvent.setup();
      const onSuccess = vi.fn();
      // healthcareService has no encounter extensions → bookEncounter returns undefined.
      // Single service → auto-selected, so we go straight to waiting for the appointment buttons.
      setupWithRoutes(createScheduleWithServices([healthcareService]), onSuccess);

      const apptButtons = await screen.findAllByRole('button', { name: /2024/i });
      await user.click(apptButtons[0]);
      await bookWithHomer(user);

      await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
      expect(screen.queryByTestId('encounter-page')).not.toBeInTheDocument();
    });
  });

  describe('Request Cancellation', () => {
    test('passes abort signal to API call', async () => {
      const user = userEvent.setup();

      await act(async () => {
        setup();
      });

      await user.click(screen.getByText('Annual Checkup'));
      expect(medplum.get).toHaveBeenCalledWith(
        expect.objectContaining({ href: expect.stringContaining('$find') }),
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });
  });

  describe('Reference deduplication', () => {
    test('shows a service only once when its multiple type codings produce duplicate references', async () => {
      // A service with 2 types produces 2 CodeableConcept entries via toCodeableReferenceLike,
      // both carrying a reference to the same HealthcareService.
      const multiTypeService = await medplum.createResource<HealthcareService>({
        resourceType: 'HealthcareService',
        name: 'Multi-Type Service',
        type: [
          { coding: [{ code: 'type-a' }], text: 'Type A' },
          { coding: [{ code: 'type-b' }], text: 'Type B' },
        ],
        extension: [
          { url: SchedulingParametersURI, extension: [{ url: 'duration', valueDuration: { value: 30, unit: 'min' } }] },
        ],
      });

      // toCodeableReferenceLike produces one concept per type entry, each referencing the same service
      const schedule = createScheduleWithServices([multiTypeService]);
      expect(schedule.serviceType).toHaveLength(2); // confirm two entries in serviceType

      const readRefSpy = vi.spyOn(medplum, 'readReference');

      await act(async () => setup({ schedule }));

      // Service button appears exactly once
      await waitFor(() => expect(screen.getByText('Multi-Type Service')).toBeInTheDocument());
      expect(screen.getAllByText('Multi-Type Service')).toHaveLength(1);

      // readReference was called once for HealthcareService (deduplicated)
      const hsCalls = readRefSpy.mock.calls.filter(([ref]) =>
        (ref as { reference?: string }).reference?.startsWith('HealthcareService/')
      );
      expect(hsCalls).toHaveLength(1);
    });

    test('skips serviceType concepts that have no reference field without crashing', async () => {
      // Build a schedule with one valid concept and one malformed concept (extension with no reference).
      const validServiceTypes = toCodeableReferenceLike(healthcareService);
      const malformedConcept = {
        extension: [
          {
            url: ServiceTypeReferenceURI,
            valueReference: {}, // intentionally missing `reference`
          },
        ],
      };

      const schedule: WithId<Schedule> = {
        resourceType: 'Schedule',
        id: 'schedule-dedup',
        actor: [{ reference: 'Practitioner/practitioner-1' }],
        active: true,
        serviceType: [...validServiceTypes, malformedConcept],
      };

      const readRefSpy = vi.spyOn(medplum, 'readReference');

      await act(async () => setup({ schedule }));

      // The valid service still appears; no crash from the malformed concept
      await waitFor(() => expect(screen.getByText('Annual Checkup')).toBeInTheDocument());

      // readReference was NOT called for the malformed concept (which has no reference string)
      const calls = readRefSpy.mock.calls;
      const calledRefs = calls.map(([ref]) => (ref as { reference?: string }).reference);
      expect(calledRefs.every((r) => r && r.length > 0)).toBe(true);
    });
  });
});
