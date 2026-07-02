// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import { createReference, ReadablePromise } from '@medplum/core';
import type {
  Appointment,
  Bundle,
  CodeableConcept,
  HealthcareService,
  ResourceType,
  Schedule,
  Slot,
} from '@medplum/fhirtypes';
import { DrAliceSmith, DrAliceSmithSchedule, HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, getByText, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, MemoryRouter, Route, RouterProvider, Routes } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { SchedulingParametersURI } from '../../utils/scheduling';
import { toCodeableReferenceLike } from '../../utils/servicetype';
import { SchedulePage } from './SchedulePage';

describe('SchedulePage', () => {
  let medplum: MockClient;
  let mockSchedule: Schedule;

  beforeEach(async () => {
    medplum = new MockClient();

    vi.clearAllMocks();

    mockSchedule = {
      resourceType: 'Schedule',
      id: 'schedule-1',
      actor: [{ reference: 'Practitioner/practitioner-1' }],
      active: true,
    };

    // Store the schedule so readResource('Schedule', 'schedule-1') works
    await medplum.createResource(mockSchedule);
    medplum.searchOne = vi.fn().mockResolvedValue(mockSchedule);
    medplum.searchResources = vi.fn().mockResolvedValue([]);
  });

  const setup = (
    initialPath = '/Calendar/Schedule/schedule-1'
  ): ReturnType<typeof render> & { navigate: ReturnType<typeof createMemoryRouter>['navigate'] } => {
    const router = createMemoryRouter(
      [
        { path: '/Calendar/Schedule/:id/settings', element: <div>Settings Page</div> },
        { path: '/Calendar/Schedule/:id', element: <SchedulePage /> },
        { path: '/Calendar/Schedule', element: <SchedulePage /> },
      ],
      { initialEntries: [initialPath] }
    );

    const result = render(
      <MedplumProvider medplum={medplum}>
        <MantineProvider>
          <Notifications />
          <RouterProvider router={router} />
        </MantineProvider>
      </MedplumProvider>
    );

    return { ...result, navigate: router.navigate.bind(router) };
  };

  describe('Initial Rendering', () => {
    test('loads existing schedule for practitioner', async () => {
      await act(async () => {
        setup('/Calendar/Schedule');
      });

      await waitFor(() => {
        expect(medplum.searchOne).toHaveBeenCalledWith('Schedule', expect.any(Object));
      });
    });

    test('shows the no-schedule empty state when profile has no schedule', async () => {
      medplum.searchOne = vi.fn().mockResolvedValue(undefined);
      medplum.createResource = vi.fn();

      await act(async () => {
        setup('/Calendar/Schedule');
      });

      await waitFor(() => {
        expect(screen.getByText(/No schedule found/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Create Schedule' })).toBeInTheDocument();
      });

      // Must not auto-create — the user must click the button
      expect(medplum.createResource).not.toHaveBeenCalled();
    });

    test('renders calendar when schedule is loaded', async () => {
      await act(async () => {
        setup();
      });

      await waitFor(() => {
        // Calendar should be rendered (check for Today button in toolbar)
        expect(screen.getByText('Today')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    test('handles schedule search error gracefully', async () => {
      medplum.searchOne = vi.fn().mockRejectedValue(new Error('Search failed'));

      await act(async () => {
        setup('/Calendar/Schedule');
      });

      await waitFor(() => {
        expect(medplum.searchOne).toHaveBeenCalled();
      });

      // Component should handle error (may return null or show error state)
      // The exact behavior depends on error handling implementation
    });
  });

  describe('Loading indicator', () => {
    test('shows a loader while searching for the profile schedule', async () => {
      medplum.searchOne = vi.fn().mockReturnValue(new Promise(() => {}));

      await act(async () => {
        setup('/Calendar/Schedule');
      });

      // Neither the calendar nor the empty-state button should appear while loading
      expect(screen.queryByText('Today')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Create Schedule' })).not.toBeInTheDocument();
    });

    test('shows a loader while fetching a schedule by id', () => {
      medplum.readResource = vi.fn().mockReturnValue(new Promise(() => {}));

      setup('/Calendar/Schedule/schedule-1');

      expect(screen.queryByText('Today')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Create Schedule' })).not.toBeInTheDocument();
    });

    test('shows a loader immediately when navigating to a different schedule id', async () => {
      // Intercept reads for schedule-2 and keep them pending, pass through everything else
      const origReadResource = medplum.readResource.bind(medplum);
      medplum.readResource = vi.fn().mockImplementation((resourceType: ResourceType, id: string) => {
        if (id === 'schedule-2') {
          return new Promise(() => {}); // never resolves — keeps the loading state visible
        }
        return origReadResource(resourceType, id);
      });

      const { navigate } = setup('/Calendar/Schedule/schedule-1');

      await waitFor(() => expect(screen.getByText('Today')).toBeInTheDocument());

      // Trigger navigation without other interaction, similar to using browser "back" button
      await act(async () => navigate('/Calendar/Schedule/schedule-2'));

      expect(screen.queryByText('Today')).not.toBeInTheDocument();
    });

    test('clears the loading state when re-selecting the actor of the displayed schedule', async () => {
      const user = userEvent.setup();

      // Make the schedule's actor selectable in the ReferenceInput dropdown
      const practitioner = {
        resourceType: 'Practitioner',
        id: 'practitioner-1',
        name: [{ given: ['Jane'], family: 'Practitioner' }],
      };
      medplum.searchResources = vi
        .fn()
        .mockImplementation((resourceType: ResourceType) =>
          Promise.resolve(resourceType === 'Practitioner' ? [practitioner] : [])
        );

      await act(async () => {
        setup('/Calendar/Schedule/schedule-1');
      });
      await waitFor(() => expect(screen.getByText('Today')).toBeInTheDocument());

      // Re-select the actor whose schedule is already displayed. The search
      // finds schedule-1 again, so navigation would be a no-op.
      const actorInput = screen
        .getAllByRole('searchbox')
        .find((el) => el.getAttribute('name') === 'schedule-actor-id') as HTMLElement;
      await user.type(actorInput, 'Jane');
      await user.click(await screen.findByText('Jane Practitioner'));

      await waitFor(() => {
        expect(medplum.searchOne).toHaveBeenCalledWith('Schedule', { actor: 'Practitioner/practitioner-1' });
      });

      // The spinner must clear and the calendar must remain visible
      await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
      await waitFor(() => expect(screen.getByText('Today')).toBeInTheDocument());
    });

    test('clears the loading state when readResource rejects during navigation', async () => {
      const origReadResource = medplum.readResource.bind(medplum);
      medplum.readResource = vi.fn().mockImplementation((resourceType: ResourceType, id: string) => {
        if (id === 'schedule-2') {
          return Promise.reject(new Error('Not found'));
        }
        return origReadResource(resourceType, id);
      });

      const { navigate } = setup('/Calendar/Schedule/schedule-1');

      await waitFor(() => expect(screen.getByText('Today')).toBeInTheDocument());
      await act(async () => navigate('/Calendar/Schedule/schedule-2'));

      // Spinner must clear — page must not be permanently stuck
      await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());

      // It should not show a mismatched schedule
      expect(screen.queryByText('Today')).not.toBeInTheDocument();
    });
  });

  describe('No-schedule empty state', () => {
    test('shows practitioner name in message when the reference has a display', async () => {
      // Use DrAliceSmith so createReference produces a display name
      medplum = new MockClient({ profile: DrAliceSmith });
      medplum.searchOne = vi.fn().mockResolvedValue(undefined);
      medplum.searchResources = vi.fn().mockResolvedValue([]);

      await act(async () => {
        render(
          <MemoryRouter initialEntries={['/Calendar/Schedule']}>
            <MedplumProvider medplum={medplum}>
              <MantineProvider>
                <Notifications />
                <Routes>
                  <Route path="/Calendar/Schedule/:id" element={<SchedulePage />} />
                  <Route path="/Calendar/Schedule" element={<SchedulePage />} />
                </Routes>
              </MantineProvider>
            </MedplumProvider>
          </MemoryRouter>
        );
      });

      await waitFor(() => {
        expect(screen.getByText(/No schedule found for Alice Smith/)).toBeInTheDocument();
      });
    });

    test('clicking Create Schedule creates the resource and navigates to the calendar', async () => {
      const user = userEvent.setup();
      medplum.searchOne = vi.fn().mockResolvedValue(undefined);
      medplum.createResource = vi.fn().mockResolvedValue(mockSchedule);

      await act(async () => {
        setup('/Calendar/Schedule');
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Create Schedule' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Create Schedule' }));

      await waitFor(() => {
        expect(medplum.createResource).toHaveBeenCalledWith(
          expect.objectContaining({ resourceType: 'Schedule', active: true })
        );
      });

      // After creation the page navigates to the new schedule and renders the calendar
      await waitFor(() => {
        expect(screen.getByText('Today')).toBeInTheDocument();
      });
    });

    test('shows an error notification and keeps the empty state when creation fails', async () => {
      const user = userEvent.setup();
      medplum.searchOne = vi.fn().mockResolvedValue(undefined);
      medplum.createResource = vi.fn().mockRejectedValue(new Error('Creation failed'));

      await act(async () => {
        setup('/Calendar/Schedule');
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Create Schedule' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Create Schedule' }));

      await waitFor(() => {
        expect(screen.getByText(/Creation failed/)).toBeInTheDocument();
      });

      // Empty state remains visible after a failed creation
      expect(screen.getByRole('button', { name: 'Create Schedule' })).toBeInTheDocument();
    });
  });

  describe('Settings gear icon', () => {
    test('when the scheduling feature is disabled the gear icon is hidden', async () => {
      await act(async () => setup());
      await waitFor(() => expect(screen.getByText('Today')).toBeInTheDocument());
      expect(screen.queryByRole('button', { name: 'Schedule settings' })).not.toBeInTheDocument();
    });

    test('when the scheduling feature is enabled the gear icon is visible', async () => {
      medplum.getProject = vi.fn().mockReturnValue({
        resourceType: 'Project',
        id: 'project-123',
        features: ['scheduling'],
      });
      await act(async () => setup());
      await waitFor(() => expect(screen.getByText('Today')).toBeInTheDocument());
      expect(screen.getByRole('button', { name: 'Schedule settings' })).toBeInTheDocument();
    });

    test('clicking the gear icon navigates to the schedule settings page', async () => {
      const user = userEvent.setup();

      medplum.getProject = vi.fn().mockReturnValue({
        resourceType: 'Project',
        id: 'project-123',
        features: ['scheduling'],
      });
      await act(async () => setup());
      await user.click(screen.getByRole('button', { name: 'Schedule settings' }));
      await waitFor(() => expect(screen.getByText('Settings Page')).toBeInTheDocument());
    });
  });
});

describe('$find/$book component integration tests', () => {
  let medplum: MockClient;
  let healthcareService: WithId<HealthcareService>;

  const serviceType1: CodeableConcept = {
    coding: [
      {
        system: 'http://example.com/service-types',
        code: 'checkup',
      },
    ],
    text: 'Annual Checkup',
  };

  beforeEach(async () => {
    medplum = new MockClient({ profile: DrAliceSmith });
    vi.clearAllMocks();

    // Mock window.innerHeight for calendar height calculation
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 800,
    });

    healthcareService = await medplum.createResource<HealthcareService>({
      resourceType: 'HealthcareService',
      name: 'Annual Checkup',
      type: [serviceType1],
      extension: [
        { url: SchedulingParametersURI, extension: [{ url: 'duration', valueDuration: { value: 20, unit: 'min' } }] },
      ],
    });
  });

  const setup = (initialPath = '/Calendar/Schedule/alice-smith-schedule'): ReturnType<typeof render> => {
    return render(
      <MemoryRouter initialEntries={[initialPath]}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <Routes>
              <Route path="/Calendar/Schedule/:id" element={<SchedulePage />} />
              <Route path="/Calendar/Schedule" element={<SchedulePage />} />
            </Routes>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('Adds new appointments and slots after ScheduleFindPane $book success', async () => {
    // set system clock so the week we are creating an event for is visible in the big calendar
    vi.setSystemTime('2024-01-15');
    const slotStart = '2024-01-16T10:00:00Z';
    const slotEnd = '2024-01-16T10:30:00Z';
    const bufferEnd = '2024-01-16T10:45:00Z';

    const user = userEvent.setup();

    // Add scheduling parameter extension to Alice's schedule
    await medplum.updateResource({
      ...DrAliceSmithSchedule,
      serviceType: toCodeableReferenceLike(healthcareService),
      extension: [
        {
          url: SchedulingParametersURI,
          extension: [
            { url: 'serviceType', valueCodeableConcept: serviceType1 },
            { url: 'bufferAfter', valueDuration: { value: 15, unit: 'min' } },
          ],
        },
      ],
    } satisfies Schedule);

    // Mock $find operation
    const originalGet = medplum.get.bind(medplum);
    const mockFindAppointments: Appointment[] = [
      {
        resourceType: 'Appointment',
        id: 'find-appointment-1',
        status: 'proposed',
        start: slotStart,
        end: slotEnd,
        participant: [],
      },
    ];
    vi.spyOn(medplum, 'get').mockImplementation((url, options) => {
      if (url.toString().includes('$find')) {
        return new ReadablePromise(
          Promise.resolve({
            resourceType: 'Bundle',
            type: 'searchset',
            entry: mockFindAppointments.map((appointment) => ({ resource: appointment })),
          } satisfies Bundle<Appointment>)
        );
      }
      return originalGet(url, options);
    });

    // Mock $book operation
    const mockBookResponse: Bundle<Appointment | Slot> = {
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        {
          resource: {
            resourceType: 'Appointment',
            id: 'appointment-123',
            status: 'booked',
            start: slotStart,
            end: slotEnd,
            slot: [{ reference: 'Slot/slot-123' }, { reference: 'Slot/slot-124' }],
            participant: [
              { actor: { reference: 'Practitioner/practitioner-1' }, status: 'tentative' },
              { actor: createReference(HomerSimpson), status: 'accepted' },
            ],
          },
        },
        {
          // a "busy" slot is created matching the created appointment time
          resource: {
            resourceType: 'Slot',
            id: 'slot-123',
            status: 'busy',
            start: slotStart,
            end: slotEnd,
            schedule: { reference: 'Schedule/schedule-1' },
          },
        },
        {
          // example of a "buffer-after" slot that can be created by $book
          resource: {
            resourceType: 'Slot',
            id: 'slot-124',
            status: 'busy-unavailable',
            start: slotEnd,
            end: bufferEnd,
            schedule: { reference: 'Schedule/schedule-1' },
          },
        },
      ],
    };
    medplum.post = vi.fn().mockResolvedValue(mockBookResponse);

    await act(async () => {
      setup('/Calendar/Schedule/alice-smith-schedule');
    });

    // Pane header shows selected service type
    expect(screen.getByText('Annual Checkup')).toBeInTheDocument();

    // Click on an appointment button from the find pane
    const slotButtons = screen.getAllByText(/1\/16\/2024/);
    expect(slotButtons.length).toEqual(1);
    await user.click(slotButtons[0]);

    // Choose a patient
    const patientInput = screen.getByRole('searchbox');
    await user.type(patientInput, 'Homer');
    await waitFor(() => {
      expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Homer Simpson'));

    // Submit the form
    await user.click(screen.getByRole('button', { name: 'Create Appointment' }));

    // Appointment should be in the big calendar
    const calendar = screen.getByTestId('calendar');
    expect(getByText(calendar, 'Homer Simpson')).toBeInTheDocument();

    // Buffer-after unavailable slot should be in the big calendar
    expect(screen.getByText('Blocked')).toBeInTheDocument();
  });
});

describe('Cancel Visit integration', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    medplum = new MockClient({ profile: DrAliceSmith });
    vi.clearAllMocks();

    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 800,
    });
  });

  const setup = (initialPath = '/Calendar/Schedule/alice-smith-schedule'): ReturnType<typeof render> => {
    return render(
      <MemoryRouter initialEntries={[initialPath]}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <Routes>
              <Route path="/Calendar/Schedule/:id" element={<SchedulePage />} />
            </Routes>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('Using the "Cancel Visit" button in the appointment details drawer', async () => {
    vi.setSystemTime('2024-01-15');

    const bookedAppointment = {
      resourceType: 'Appointment',
      id: 'appointment-to-cancel',
      status: 'booked',
      start: '2024-01-16T10:00:00Z',
      end: '2024-01-16T10:30:00Z',
      participant: [{ actor: { reference: 'Patient/patient-1', display: 'Jane Doe' }, status: 'accepted' }],
    } satisfies Appointment;
    const cancelledAppointment = { ...bookedAppointment, status: 'cancelled' } satisfies Appointment;

    medplum.searchResources = vi.fn().mockImplementation((resourceType: string) => {
      if (resourceType === 'Appointment') {
        return Promise.resolve([bookedAppointment]);
      }
      return Promise.resolve([]);
    });

    medplum.searchOne = vi.fn().mockImplementation((resourceType: string) => {
      if (resourceType === 'Schedule') {
        return Promise.resolve(DrAliceSmithSchedule);
      }
      return Promise.resolve(undefined); // no Encounter
    });

    const postMock = vi.fn().mockResolvedValue(cancelledAppointment);
    medplum.post = postMock;

    const user = userEvent.setup();

    await act(async () => setup());
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());

    await user.click(screen.getByText('Jane Doe'));

    await waitFor(() => {
      expect(screen.getByText('Appointment Details')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Cancel Visit/i })).toBeInTheDocument();
    });

    // Clicking "Cancel Visit" calls $cancel endpoint
    await user.click(screen.getByRole('button', { name: /Cancel Visit/i }));
    await waitFor(() => {
      const postUrl = postMock.mock.calls[0][0];
      expect(postUrl.toString()).toContain('Appointment/appointment-to-cancel/$cancel');
    });

    // Drawer should close after cancellation completes
    await waitFor(() => {
      expect(screen.queryByText('Appointment Details')).not.toBeInTheDocument();
    });

    // Cancelled appointment is no longer visible in the calendar view
    await waitFor(() => expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument());
  });
});
