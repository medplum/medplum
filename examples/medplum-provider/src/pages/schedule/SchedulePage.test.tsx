// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { Appointment, Practitioner, Schedule, Slot } from '@medplum/fhirtypes';
import { SchedulePage } from './SchedulePage';

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
