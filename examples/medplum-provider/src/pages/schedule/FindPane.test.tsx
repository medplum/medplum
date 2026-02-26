// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import type { Appointment, Bundle, CodeableConcept, Schedule, Slot } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { FindPane } from './FindPane';

const SchedulingParametersURI = 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters';

describe('FindPane', () => {
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
    onSuccess?: (results: { appointments: Appointment[]; slots: Slot[] }) => void;
    slots?: Slot[];
  };

  const setup = (options: SetupOptions = {}): ReturnType<typeof render> => {
    const {
      schedule = createScheduleWithServiceTypes([serviceType1, serviceType2]),
      range = defaultRange,
      onSuccess = vi.fn(),
    } = options;

    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <FindPane schedule={schedule} range={range} onSuccess={onSuccess} />
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

  describe('Auto-Selection with Single Service Type', () => {
    test('auto-selects when there is exactly one service type', async () => {
      const schedule = createScheduleWithServiceTypes([serviceType1]);

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
    test('Displays a form for the chosen slot', async () => {
      const user = userEvent.setup();
      const onSuccess = vi.fn();

      await act(async () => {
        setup({ slots: mockSlots, onSuccess });
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
      expect(slotButtons).not.toHaveLength(0);
      await user.click(slotButtons[0]);

      // See creation form become visible
      expect(screen.getByRole('button', { name: 'Create Appointment' })).toBeInTheDocument();

      // Dismissing the form takes us back to the slot choices
      const dismissButton = screen.getByLabelText('Clear selection');
      expect(dismissButton).toBeInTheDocument();
      await user.click(dismissButton);

      const slotButtons2 = screen.getAllByRole('button').filter((btn) => btn.textContent?.includes('2024'));
      expect(slotButtons2).not.toHaveLength(0);
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
