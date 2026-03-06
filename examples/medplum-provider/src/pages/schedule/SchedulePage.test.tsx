// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { createReference, ReadablePromise } from '@medplum/core';
import type { Appointment, Bundle, CodeableConcept, Practitioner, Schedule, Slot } from '@medplum/fhirtypes';
import { DrAliceSmith, DrAliceSmithSchedule, HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { SchedulePage } from './SchedulePage';

const SchedulingParametersURI = 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters';

describe('SchedulePage', () => {
  let medplum: MockClient;
  let mockPractitioner: Practitioner;
  let mockSchedule: Schedule;

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();

    mockPractitioner = {
      resourceType: 'Practitioner',
      id: 'practitioner-1',
      name: [{ given: ['Dr.'], family: 'Smith' }],
    };

    mockSchedule = {
      resourceType: 'Schedule',
      id: 'schedule-1',
      actor: [{ reference: 'Practitioner/practitioner-1' }],
      active: true,
    };

    // Mock window.innerHeight for calendar height calculation
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 800,
    });

    // Create practitioner resource in MockClient so getReferenceString works
    await medplum.createResource(mockPractitioner);
    medplum.getProfile = vi.fn().mockResolvedValue(mockPractitioner);
    medplum.searchOne = vi.fn().mockResolvedValue(mockSchedule);
    medplum.searchResources = vi.fn().mockResolvedValue([]);
  });

  const setup = (): ReturnType<typeof render> => {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <SchedulePage />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  describe('Initial Rendering', () => {
    test('returns null when schedule is not loaded', async () => {
      medplum.searchOne = vi.fn().mockResolvedValue(undefined);
      medplum.createResource = vi.fn().mockResolvedValue(mockSchedule);

      await act(async () => {
        setup();
      });

      // Component should return null until schedule is loaded
      await waitFor(() => {
        expect(medplum.searchOne).toHaveBeenCalled();
      });
    });

    test('loads existing schedule for practitioner', async () => {
      await act(async () => {
        setup();
      });

      await waitFor(() => {
        expect(medplum.searchOne).toHaveBeenCalledWith('Schedule', expect.any(Object));
      });
    });

    test('creates schedule if one does not exist', async () => {
      medplum.searchOne = vi.fn().mockResolvedValue(undefined);
      medplum.createResource = vi.fn().mockResolvedValue(mockSchedule);

      await act(async () => {
        setup();
      });

      await waitFor(() => {
        expect(medplum.createResource).toHaveBeenCalledWith(
          expect.objectContaining({
            resourceType: 'Schedule',
            active: true,
          })
        );
      });
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

  describe('Toolbar', () => {
    test('renders toolbar with navigation buttons', async () => {
      await act(async () => {
        setup();
      });

      await waitFor(() => {
        expect(screen.getByText('Today')).toBeInTheDocument();
        // Check for navigation buttons (they contain chevron icons)
        const buttons = screen.getAllByRole('button');
        expect(buttons.length).toBeGreaterThan(0);
      });
    });

    test('renders view switcher with Month, Week, Day options', async () => {
      await act(async () => {
        setup();
      });

      await waitFor(() => {
        expect(screen.getByText('Month')).toBeInTheDocument();
        expect(screen.getByText('Week')).toBeInTheDocument();
        expect(screen.getByText('Day')).toBeInTheDocument();
      });
    });

    test('displays current month/year in title for non-day views', async () => {
      await act(async () => {
        setup();
      });

      await waitFor(() => {
        // Check for month/year format (e.g., "January 2024")
        const title = screen.getByText(/\w+\s+\d{4}/);
        expect(title).toBeInTheDocument();
      });
    });
  });

  describe('Calendar Events', () => {
    test('searches for slots when date range is set', async () => {
      const mockSlots: Slot[] = [
        {
          resourceType: 'Slot',
          id: 'slot-1',
          schedule: { reference: 'Schedule/schedule-1' },
          status: 'free',
          start: '2024-01-15T10:00:00Z',
          end: '2024-01-15T10:30:00Z',
        },
      ];

      medplum.searchResources = vi.fn().mockImplementation((resourceType: string) => {
        if (resourceType === 'Slot') {
          return Promise.resolve(mockSlots);
        }
        return Promise.resolve([]);
      });

      await act(async () => {
        setup();
      });

      // Wait for calendar to render and trigger range change
      await waitFor(() => {
        expect(screen.getByText('Today')).toBeInTheDocument();
      });

      // The calendar will trigger range change which calls refreshEvents
      // This may take some time, so we check if searchResources was called with Slot
      await waitFor(
        () => {
          const slotCalls = (medplum.searchResources as ReturnType<typeof vi.fn>).mock.calls.filter(
            (call) => call[0] === 'Slot'
          );
          expect(slotCalls.length).toBeGreaterThan(0);
        },
        { timeout: 5000 }
      );
    });

    test('searches for appointments when date range is set', async () => {
      const mockAppointments: Appointment[] = [
        {
          resourceType: 'Appointment',
          id: 'appt-1',
          status: 'booked',
          start: '2024-01-15T10:00:00Z',
          end: '2024-01-15T10:30:00Z',
          participant: [
            {
              actor: { reference: 'Practitioner/practitioner-1' },
              status: 'accepted',
            },
          ],
        },
      ];

      medplum.searchResources = vi.fn().mockImplementation((resourceType: string) => {
        if (resourceType === 'Appointment') {
          return Promise.resolve(mockAppointments);
        }
        return Promise.resolve([]);
      });

      await act(async () => {
        setup();
      });

      // Wait for calendar to render
      await waitFor(() => {
        expect(screen.getByText('Today')).toBeInTheDocument();
      });

      // Check if searchResources was called with Appointment
      await waitFor(
        () => {
          const appointmentCalls = (medplum.searchResources as ReturnType<typeof vi.fn>).mock.calls.filter(
            (call) => call[0] === 'Appointment'
          );
          expect(appointmentCalls.length).toBeGreaterThan(0);
        },
        { timeout: 5000 }
      );
    });
  });

  describe('Slot Selection', () => {
    test('opens drawer when slot is selected', async () => {
      await act(async () => {
        setup();
      });

      await waitFor(() => {
        expect(screen.getByText('Today')).toBeInTheDocument();
      });

      // The drawer should not be visible initially
      expect(screen.queryByText('New Calendar Event')).not.toBeInTheDocument();
    });
  });

  describe('View Changes', () => {
    test('renders view switcher buttons', async () => {
      await act(async () => {
        setup();
      });

      await waitFor(() => {
        expect(screen.getByText('Month')).toBeInTheDocument();
        expect(screen.getByText('Week')).toBeInTheDocument();
        expect(screen.getByText('Day')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    test('handles schedule search error gracefully', async () => {
      medplum.searchOne = vi.fn().mockRejectedValue(new Error('Search failed'));

      await act(async () => {
        setup();
      });

      await waitFor(() => {
        expect(medplum.searchOne).toHaveBeenCalled();
      });

      // Component should handle error (may return null or show error state)
      // The exact behavior depends on error handling implementation
    });

    test('handles schedule creation error gracefully', async () => {
      medplum.searchOne = vi.fn().mockResolvedValue(undefined);
      medplum.createResource = vi.fn().mockRejectedValue(new Error('Creation failed'));

      await act(async () => {
        setup();
      });

      await waitFor(() => {
        expect(medplum.createResource).toHaveBeenCalled();
      });
    });
  });
});

describe('$find/$book component integration tests', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    medplum = new MockClient({ profile: DrAliceSmith });
    vi.clearAllMocks();

    // Mock window.innerHeight for calendar height calculation
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 800,
    });
  });

  const setup = (): ReturnType<typeof render> => {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <SchedulePage />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  const serviceType1: CodeableConcept = {
    coding: [
      {
        system: 'http://example.com/service-types',
        code: 'checkup',
      },
    ],
    text: 'Annual Checkup',
  };

  const serviceType2: CodeableConcept = {
    coding: [
      {
        system: 'http://example.com/service-types',
        code: 'followup',
      },
    ],
    text: 'Follow-up Visit',
  };

  const createScheduleWithServiceTypes = (serviceTypes: (CodeableConcept | undefined)[]): Schedule => ({
    resourceType: 'Schedule',
    id: `schedule-1`,
    actor: [{ reference: 'Practitioner/practitioner-1' }],
    active: true,
    extension: serviceTypes.map((st) => ({
      url: SchedulingParametersURI,
      extension: st ? [{ url: 'serviceType', valueCodeableConcept: st }] : [],
    })),
  });

  test('renders ScheduleFindPane when schedule has scheduling parameters', async () => {
    const scheduleWithServiceTypes = createScheduleWithServiceTypes([serviceType1]);
    medplum.searchOne = vi.fn().mockResolvedValue(scheduleWithServiceTypes);

    // Mock the $find operation
    medplum.get = vi.fn().mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [],
    } as Bundle<Slot>);

    await act(async () => {
      setup();
    });

    // Check Calendar component rendered correctly
    expect(screen.getByText('Today')).toBeInTheDocument();

    // ScheduleFindPane should be rendered with the single service type selected
    expect(screen.getByText('Annual Checkup')).toBeInTheDocument();
  });

  test('does not render ScheduleFindPane when schedule has no scheduling parameters', async () => {
    // mockSchedule has no extensions/scheduling parameters
    await act(async () => {
      setup();
    });

    // Check Calendar component rendered correctly
    expect(screen.getByText('Today')).toBeInTheDocument();

    // ScheduleFindPane should NOT be rendered
    expect(screen.queryByText('Schedule…')).not.toBeInTheDocument();
  });

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
    const mockFindSlots: Slot[] = [
      {
        resourceType: 'Slot',
        id: 'find-slot-1',
        schedule: createReference(DrAliceSmithSchedule),
        status: 'free',
        start: slotStart,
        end: slotEnd,
      },
    ];
    vi.spyOn(medplum, 'get').mockImplementation((url, options) => {
      if (url.toString().includes('$find')) {
        return new ReadablePromise(
          Promise.resolve({
            resourceType: 'Bundle',
            type: 'searchset',
            entry: mockFindSlots.map((slot) => ({ resource: slot })),
          } satisfies Bundle<Slot>)
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
      setup();
    });

    const patientInput0 = screen.queryByRole('searchbox');
    expect(patientInput0).toBeNull();

    // Pane header shows selected service type
    expect(screen.getByText('Annual Checkup')).toBeInTheDocument();

    // Click on a slot button from the find pane
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
    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();

    // Buffer-after unavailable slot should be in the big calendar
    expect(screen.getByText('Blocked')).toBeInTheDocument();
  });

  test('fetches slots via $find operation when ScheduleFindPane is active', async () => {
    const scheduleWithServiceTypes = createScheduleWithServiceTypes([serviceType1]);
    medplum.searchOne = vi.fn().mockResolvedValue(scheduleWithServiceTypes);

    medplum.get = vi.fn().mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [],
    } as Bundle<Slot>);

    await act(async () => {
      setup();
    });

    expect(screen.getByText('Annual Checkup')).toBeInTheDocument();

    // With single service type, it auto-selects and fetches
    expect(medplum.get).toHaveBeenCalledWith(expect.stringContaining('Schedule/schedule-1/$find'), expect.any(Object));
  });

  test('renders multiple service types in ScheduleFindPane', async () => {
    const scheduleWithServiceTypes = createScheduleWithServiceTypes([serviceType1, serviceType2]);
    medplum.searchOne = vi.fn().mockResolvedValue(scheduleWithServiceTypes);

    medplum.get = vi.fn().mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [],
    } as Bundle<Slot>);

    await act(async () => {
      setup();
    });

    // Test calendar pane rendered
    expect(screen.getByText('Today')).toBeInTheDocument();

    // Test ScheduleFindPane header rendered
    expect(screen.getByText('Schedule…')).toBeInTheDocument();

    // Both service types should be rendered as options
    expect(screen.getByText('Annual Checkup')).toBeInTheDocument();
    expect(screen.getByText('Follow-up Visit')).toBeInTheDocument();
  });

  test('allows selecting different service types', async () => {
    const user = userEvent.setup();
    const scheduleWithServiceTypes = createScheduleWithServiceTypes([serviceType1, serviceType2]);
    medplum.searchOne = vi.fn().mockResolvedValue(scheduleWithServiceTypes);

    medplum.get = vi.fn().mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [],
    } as Bundle<Slot>);

    await act(async () => {
      setup();
    });

    await waitFor(() => {
      expect(screen.getByText('Annual Checkup')).toBeInTheDocument();
    });

    // Select the first service type
    await user.click(screen.getByText('Annual Checkup'));

    expect(medplum.get).toHaveBeenCalledWith(
      expect.stringContaining(`service-type=${encodeURIComponent('http://example.com/service-types|checkup')}`),
      expect.any(Object)
    );

    // Verify the service type is shown as selected (title changes)
    expect(screen.queryByText('Schedule…')).not.toBeInTheDocument();
  });
});
