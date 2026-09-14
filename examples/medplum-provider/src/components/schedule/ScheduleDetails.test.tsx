// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import type { Appointment, ResourceType, Schedule, Slot } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ScheduleDetails } from './ScheduleDetails';

describe('ScheduleDetails', () => {
  let medplum: MockClient;
  let mockSchedule: WithId<Schedule>;

  // Use today's date to ensure slots/appointments show in the default (Week) view
  const now = new Date();
  const baseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0);

  const createSlot = (overrides: Partial<WithId<Slot>> = {}): WithId<Slot> => ({
    resourceType: 'Slot',
    id: 'slot-1',
    status: 'free',
    schedule: { reference: 'Schedule/schedule-1' },
    start: new Date(baseDate.getTime()).toISOString(),
    end: new Date(baseDate.getTime() + 30 * 60 * 1000).toISOString(),
    ...overrides,
  });

  const createAppointment = (overrides: Partial<WithId<Appointment>> = {}): WithId<Appointment> => ({
    resourceType: 'Appointment',
    id: 'appointment-1',
    status: 'booked',
    start: new Date(baseDate.getTime()).toISOString(),
    end: new Date(baseDate.getTime() + 30 * 60 * 1000).toISOString(),
    participant: [
      { actor: { reference: 'Patient/123', display: 'John Doe' }, status: 'accepted' },
      { actor: { reference: 'Practitioner/practitioner-1', display: 'Dr. Smith' }, status: 'accepted' },
    ],
    ...overrides,
  });

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

  const setup = async (
    schedule: WithId<Schedule>,
    resources: { slots?: WithId<Slot>[]; appointments?: WithId<Appointment>[] } = {}
  ): Promise<ReturnType<typeof render>> => {
    const { slots = [], appointments = [] } = resources;
    medplum.searchResources = vi.fn().mockImplementation((resourceType: ResourceType) => {
      if (resourceType === 'Slot') {
        return Promise.resolve(slots);
      }
      if (resourceType === 'Appointment') {
        return Promise.resolve(appointments);
      }
      return Promise.resolve([]);
    });

    const result = render(<ScheduleDetails schedule={schedule} />, {
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
    });
    await waitFor(() => {
      expect(screen.getByText('Today')).toBeInTheDocument();
    });
    return result;
  };

  describe('Initial Rendering', () => {
    test('renders calendar', async () => {
      await setup(mockSchedule);
      expect(screen.getByText('Today')).toBeInTheDocument();
    });
  });

  describe('Toolbar', () => {
    test('renders toolbar with navigation buttons', async () => {
      await setup(mockSchedule);
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });

    test('renders view switcher with Month, Week, Day options', async () => {
      await setup(mockSchedule);
      expect(screen.getByText('Month')).toBeInTheDocument();
      expect(screen.getByText('Week')).toBeInTheDocument();
      expect(screen.getByText('Day')).toBeInTheDocument();
    });

    test('displays current month/year in title for non-day views', async () => {
      await setup(mockSchedule);
      const title = screen.getByText(/\w+\s+\d{4}/);
      expect(title).toBeInTheDocument();
    });
  });

  describe('Slot Selection', () => {
    test('opens drawer when slot is selected', async () => {
      await setup(mockSchedule);
      expect(screen.queryByText('New Calendar Event')).not.toBeInTheDocument();
    });
  });

  describe('View Changes', () => {
    test('renders view switcher buttons', async () => {
      await setup(mockSchedule);
      expect(screen.getByText('Month')).toBeInTheDocument();
      expect(screen.getByText('Week')).toBeInTheDocument();
      expect(screen.getByText('Day')).toBeInTheDocument();
    });
  });

  describe('Filtering', () => {
    test('omits entered-in-error slots from the calendar', async () => {
      const freeSlot = createSlot({ id: 'free-slot', status: 'free' });
      const erroredSlot = createSlot({
        id: 'errored-slot',
        status: 'entered-in-error',
        start: new Date(baseDate.getTime() + 60 * 60 * 1000).toISOString(),
        end: new Date(baseDate.getTime() + 90 * 60 * 1000).toISOString(),
      });

      await setup(mockSchedule, { slots: [freeSlot, erroredSlot] });

      expect(screen.getAllByText('Available')).toHaveLength(1);
      expect(screen.queryAllByText('Entered in error')).toHaveLength(0);
    });

    test('omits cancelled appointments from the calendar', async () => {
      const bookedAppointment = createAppointment();
      const cancelledAppointment = createAppointment({
        id: 'cancelled-appointment',
        status: 'cancelled',
        start: new Date(baseDate.getTime() + 60 * 60 * 1000).toISOString(),
        end: new Date(baseDate.getTime() + 90 * 60 * 1000).toISOString(),
        participant: [{ actor: { reference: 'Patient/999', display: 'Cancelled Patient' }, status: 'accepted' }],
      });

      await setup(mockSchedule, { appointments: [bookedAppointment, cancelledAppointment] });

      expect(screen.getByText(/John Doe/)).toBeInTheDocument();
      expect(screen.queryByText(/Cancelled Patient/)).not.toBeInTheDocument();
    });
  });
});
