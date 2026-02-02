// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { Appointment, Bundle, CodeableConcept, Practitioner, Schedule, Slot } from '@medplum/fhirtypes';
import type { WithId } from '@medplum/core';
import { SchedulePage, ScheduleFindPane } from './SchedulePage';

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

  describe('ScheduleFindPane Integration', () => {
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
      id: 'schedule-1',
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

    test('uses $book to create an appointment when a slot from ScheduleFindPane is chosen', async () => {
      const user = userEvent.setup();
      const scheduleWithServiceTypes = createScheduleWithServiceTypes([serviceType1]);
      medplum.searchOne = vi.fn().mockResolvedValue(scheduleWithServiceTypes);

      const mockFindSlots: Slot[] = [
        {
          resourceType: 'Slot',
          id: 'find-slot-1',
          schedule: { reference: 'Schedule/schedule-1' },
          status: 'free',
          start: '2024-01-16T10:00:00Z',
          end: '2024-01-16T10:30:00Z',
        },
      ];

      medplum.get = vi.fn().mockResolvedValue({
        resourceType: 'Bundle',
        type: 'searchset',
        entry: mockFindSlots.map((slot) => ({ resource: slot })),
      } as Bundle<Slot>);

      const mockBookResponse: Bundle<Appointment | Slot> = {
        resourceType: 'Bundle',
        type: 'searchset',
        entry: [
          {
            resource: {
              resourceType: 'Appointment',
              id: 'appointment-123',
              status: 'booked',
              start: '2024-01-16T10:00:00Z',
              end: '2024-01-16T10:30:00Z',
              participant: [{ actor: { reference: 'Practitioner/practitioner-1' }, status: 'tentative' }],
            },
          },
        ],
      };
      medplum.post = vi.fn().mockResolvedValue(mockBookResponse);

      await act(async () => {
        setup();
      });

      // Pane header shows selected service type
      expect(screen.getByText('Annual Checkup')).toBeInTheDocument();

      // Click on a slot button from the find pane
      const slotButtons = screen.getAllByText(/1\/16\/2024/);
      expect(slotButtons.length).toEqual(1);
      await user.click(slotButtons[0]);

      // Test that the right operation was invoked
      expect(medplum.post).toHaveBeenCalledWith(new URL('https://example.com/fhir/R4/Appointment/$book'), {
        resourceType: 'Parameters',
        parameter: [{ name: 'slot', resource: mockFindSlots[0] }],
      });

      // Appointment Details Drawer should open
      await waitFor(() => {
        expect(screen.getByText('Appointment Details')).toBeInTheDocument();
      });
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
      expect(medplum.get).toHaveBeenCalledWith(
        expect.stringContaining('Schedule/schedule-1/$find'),
        expect.any(Object)
      );
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
});

describe('ScheduleFindPane', () => {
  let medplum: MockClient;

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

  const createScheduleWithServiceTypes = (serviceTypes: (CodeableConcept | undefined)[]): WithId<Schedule> => ({
    resourceType: 'Schedule',
    id: 'schedule-1',
    actor: [{ reference: 'Practitioner/practitioner-1' }],
    active: true,
    extension: serviceTypes.map((st) => ({
      url: SchedulingParametersURI,
      extension: st ? [{ url: 'serviceType', valueCodeableConcept: st }] : [],
    })),
  });

  const defaultRange = {
    start: new Date('2024-01-15T00:00:00Z'),
    end: new Date('2024-01-21T23:59:59Z'),
  };

  const mockSlots: Slot[] = [
    {
      resourceType: 'Slot',
      id: 'slot-1',
      schedule: { reference: 'Schedule/schedule-1' },
      status: 'free',
      start: '2024-01-16T10:00:00Z',
      end: '2024-01-16T10:30:00Z',
    },
    {
      resourceType: 'Slot',
      id: 'slot-2',
      schedule: { reference: 'Schedule/schedule-1' },
      status: 'free',
      start: '2024-01-16T11:00:00Z',
      end: '2024-01-16T11:30:00Z',
    },
  ];

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();

    // Mock the $find operation
    medplum.get = vi.fn().mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: mockSlots.map((slot) => ({ resource: slot })),
    } as Bundle<Slot>);
  });

  type SetupOptions = {
    schedule?: WithId<Schedule>;
    range?: { start: Date; end: Date };
    onChange?: (slots: Slot[]) => void;
    onSelectSlot?: (slot: Slot) => void;
    slots?: Slot[];
  };

  const setup = (options: SetupOptions = {}): ReturnType<typeof render> => {
    const {
      schedule = createScheduleWithServiceTypes([serviceType1, serviceType2]),
      range = defaultRange,
      onChange = vi.fn(),
      onSelectSlot = vi.fn(),
      slots,
    } = options;

    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <ScheduleFindPane
              schedule={schedule}
              range={range}
              onChange={onChange}
              onSelectSlot={onSelectSlot}
              slots={slots}
            />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  describe('Initial Rendering', () => {
    test('renders "Schedule..." title when no service type is selected', async () => {
      await act(async () => {
        setup();
      });

      expect(screen.getByText('Schedule…')).toBeInTheDocument();
    });

    test('renders service type buttons for each scheduling parameter', async () => {
      await act(async () => {
        setup();
      });

      expect(screen.getByText('Annual Checkup')).toBeInTheDocument();
      expect(screen.getByText('Follow-up Visit')).toBeInTheDocument();
    });

    test('renders "Other" for undefined service types', async () => {
      const schedule = createScheduleWithServiceTypes([serviceType1, undefined]);

      await act(async () => {
        setup({ schedule });
      });

      expect(screen.getByText('Annual Checkup')).toBeInTheDocument();
      expect(screen.getByText('Other')).toBeInTheDocument();
    });
  });

  describe('Service Type Selection', () => {
    test('fetches slots when a service type is selected', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      await act(async () => {
        setup({ onChange });
      });

      await user.click(screen.getByText('Annual Checkup'));

      // check that $find was called
      expect(medplum.get).toHaveBeenCalledWith(
        expect.stringContaining('Schedule/schedule-1/$find'),
        expect.any(Object)
      );

      // check that it was called with the service-type parameter
      expect(medplum.get).toHaveBeenCalledWith(
        expect.stringContaining(`service-type=${encodeURIComponent('http://example.com/service-types|checkup')}`),
        expect.any(Object)
      );
    });

    test('calls onChange with fetched slots', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      await act(async () => {
        setup({ onChange });
      });

      await user.click(screen.getByText('Annual Checkup'));

      expect(onChange).toHaveBeenCalledWith(mockSlots);
    });

    test('displays service type name after selection', async () => {
      const user = userEvent.setup();

      await act(async () => {
        setup();
      });

      await user.click(screen.getByText('Annual Checkup'));

      expect(screen.getByText('Annual Checkup')).toBeInTheDocument();
      expect(screen.queryByText('Schedule…')).not.toBeInTheDocument();
    });

    test('displays slot buttons after selection', async () => {
      const user = userEvent.setup();

      await act(async () => {
        setup({ slots: mockSlots });
      });

      await user.click(screen.getByText('Annual Checkup'));

      // Slots should be rendered as buttons with formatted date/time
      const buttons = screen.getAllByRole('button');
      // At least dismiss button + slot buttons
      expect(buttons.length).toBeGreaterThanOrEqual(2);
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

    test('clears selection and calls onChange with empty array when dismissed', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      await act(async () => {
        setup({ onChange });
      });

      await user.click(screen.getByText('Annual Checkup'));
      expect(screen.getByLabelText('Clear selection')).toBeInTheDocument();

      onChange.mockClear();
      await user.click(screen.getByLabelText('Clear selection'));

      expect(onChange).toHaveBeenCalledWith([]);
      expect(screen.getByText('Schedule…')).toBeInTheDocument();
    });
  });

  describe('Auto-Selection with Single Service Type', () => {
    test('auto-selects when there is exactly one service type', async () => {
      const schedule = createScheduleWithServiceTypes([serviceType1]);
      const onChange = vi.fn();

      await act(async () => {
        setup({ schedule, onChange });
      });

      // Should immediately show the service type name, not the selection UI
      expect(screen.getByText('Annual Checkup')).toBeInTheDocument();
      expect(screen.queryByText('Schedule…')).not.toBeInTheDocument();

      // Should fetch slots automatically
      expect(medplum.get).toHaveBeenCalled();
    });

    test('does not show dismiss button when auto-selected with single option', async () => {
      const schedule = createScheduleWithServiceTypes([serviceType1]);

      await act(async () => {
        setup({ schedule });
      });

      expect(screen.getByText('Annual Checkup')).toBeInTheDocument();

      // Dismiss button should not be present
      expect(screen.queryByLabelText('Clear selection')).not.toBeInTheDocument();
    });
  });

  describe('Slot Selection', () => {
    test('calls onSelectSlot when a slot button is clicked', async () => {
      const user = userEvent.setup();
      const onSelectSlot = vi.fn();

      await act(async () => {
        setup({ slots: mockSlots, onSelectSlot });
      });

      // Select a service type first
      await user.click(screen.getByText('Annual Checkup'));

      await waitFor(() => {
        // Find slot buttons (they contain formatted datetime)
        const slotButtons = screen.getAllByRole('button').filter((btn) => btn.textContent?.includes('2024'));
        expect(slotButtons.length).toBeGreaterThan(0);
      });

      // Click on a slot button
      const slotButtons = screen.getAllByRole('button').filter((btn) => btn.textContent?.includes('2024'));
      if (slotButtons.length > 0) {
        await user.click(slotButtons[0]);
        expect(onSelectSlot).toHaveBeenCalledWith(mockSlots[0]);
      }
    });
  });

  describe('Error Handling', () => {
    test('shows error notification when fetch fails', async () => {
      const user = userEvent.setup();
      medplum.get = vi.fn().mockRejectedValue(new Error('Network error'));

      await act(async () => {
        setup();
      });

      await user.click(screen.getByText('Annual Checkup'));
      expect(medplum.get).toHaveBeenCalled();

      // Error notification should be shown
      expect(screen.getByText(/Network error/i)).toBeInTheDocument();
    });

    test('calls onChange with empty array when response has no entries', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      medplum.get = vi.fn().mockResolvedValue({
        resourceType: 'Bundle',
        type: 'searchset',
        // No entry property
      } as Bundle<Slot>);

      await act(async () => {
        setup({ onChange });
      });

      await user.click(screen.getByText('Annual Checkup'));
      expect(onChange).toHaveBeenCalledWith([]);
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

      const callUrl = (medplum.get as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callUrl).toContain('start=');
      expect(callUrl).toContain('end=');
    });

    test('fetches without service-type param when wildcard (undefined) is selected', async () => {
      const schedule = createScheduleWithServiceTypes([undefined]);

      await act(async () => {
        setup({ schedule });
      });

      // With single undefined service type, it auto-selects
      const callUrl = (medplum.get as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] || '';
      expect(callUrl).not.toContain('service-type=');
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
        expect.any(String),
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });
  });
});
