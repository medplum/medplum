// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import type { Appointment, Encounter, HealthcareService, ResourceType, Schedule, Slot } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import type * as ReactScheduling from '@medplum/react-scheduling';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ScheduleDetails } from './ScheduleDetails';

const { bookedByFindPane, wellnessService } = vi.hoisted(() => {
  const bookedByFindPane: WithId<Appointment> = {
    resourceType: 'Appointment',
    id: 'booked-appointment',
    status: 'booked',
    start: new Date().toISOString(),
    end: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    participant: [{ actor: { reference: 'Patient/123', display: 'Homer Simpson' }, status: 'accepted' }],
  };
  const wellnessService: WithId<HealthcareService> = {
    resourceType: 'HealthcareService',
    id: 'wellness-service',
    name: 'Wellness Service',
    availableTime: [{ daysOfWeek: ['mon'], availableStartTime: '09:00:00', availableEndTime: '17:00:00' }],
  };
  return { bookedByFindPane, wellnessService };
});

/**
 * FullCalendar owns interval selection, event clicks and double clicks through pointer
 * gestures that jsdom cannot reproduce, so the real Calendar is rendered alongside buttons
 * that invoke the same callbacks with the data the component passed in.
 */
vi.mock('@medplum/react-scheduling', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactScheduling>();
  const TestCalendar = (props: ReactScheduling.CalendarProps): React.JSX.Element => (
    <>
      <actual.Calendar {...props} />
      <button
        type="button"
        onClick={() => props.onSelectInterval?.({ start: new Date(), end: new Date(Date.now() + 30 * 60 * 1000) })}
      >
        test-select-interval
      </button>
      <button type="button" onClick={() => props.onSelectSlot?.(props.slots?.[0] as Slot)}>
        test-select-slot
      </button>
      <button type="button" onClick={() => props.onSelectAppointment?.(props.appointments?.[0] as Appointment)}>
        test-select-appointment
      </button>
      <button type="button" onClick={() => props.onDoubleClickAppointment?.(props.appointments?.[0] as Appointment)}>
        test-double-click-appointment
      </button>
      <div data-testid="available-time-count">{props.availableTime?.length ?? 'none'}</div>
    </>
  );
  return { ...actual, Calendar: TestCalendar };
});

/**
 * FindPane drives the $find flow, which is covered by its own tests; here only its
 * callbacks into ScheduleDetails matter.
 */
vi.mock('./FindPane', () => ({
  FindPane: (props: {
    onSuccess: (results: { appointment: WithId<Appointment>; slots: WithId<Slot>[] }) => void;
    onSelectHealthcareService: (service: WithId<HealthcareService> | undefined) => void;
    healthcareService: WithId<HealthcareService> | undefined;
  }) => (
    <div data-testid="find-pane">
      <span>{props.healthcareService?.name ?? 'no-service'}</span>
      <button type="button" onClick={() => props.onSuccess({ appointment: bookedByFindPane, slots: [] })}>
        test-book-success
      </button>
      <button type="button" onClick={() => props.onSelectHealthcareService(wellnessService)}>
        test-select-service
      </button>
    </div>
  ),
}));

describe('ScheduleDetails', () => {
  let medplum: MockClient;
  let mockSchedule: WithId<Schedule>;

  /** Today's date so slots/appointments fall inside the default (Week) view. */
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

  const locationOnlySchedule: WithId<Schedule> = {
    resourceType: 'Schedule',
    id: 'schedule-location',
    actor: [{ reference: 'Location/room-1' }],
    active: true,
  };

  const linkedEncounter: WithId<Encounter> = {
    resourceType: 'Encounter',
    id: 'encounter-1',
    status: 'in-progress',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB' },
    subject: { reference: 'Patient/123' },
    appointment: [{ reference: 'Appointment/appointment-1' }],
  };

  beforeEach(async () => {
    medplum = new MockClient();

    vi.clearAllMocks();
    notifications.clean();

    mockSchedule = {
      resourceType: 'Schedule',
      id: 'schedule-1',
      actor: [{ reference: 'Practitioner/practitioner-1' }],
      active: true,
    };

    await medplum.createResource(mockSchedule);
    medplum.searchOne = vi.fn().mockResolvedValue(undefined);
    medplum.searchResources = vi.fn().mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Lets Mantine's drawer transitions run to completion under fake timers so that a
   * negative assertion about the drawer is made after any close or open would have finished.
   */
  const settleDrawerTransitions = async (): Promise<void> => {
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
  };

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

    const result = render(
      <Routes>
        <Route path="/" element={<ScheduleDetails schedule={schedule} />} />
        <Route path="/Patient/:patientId/Encounter/:encounterId" element={<div>Encounter Page</div>} />
      </Routes>,
      {
        wrapper: ({ children }) => (
          <MemoryRouter initialEntries={['/']}>
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

    test('renders the find pane once the calendar reports its range', async () => {
      await setup(mockSchedule);
      expect(await screen.findByTestId('find-pane')).toBeInTheDocument();
    });

    test('shows an error notification when loading scheduling resources fails', async () => {
      medplum.searchResources = vi.fn().mockRejectedValue(new Error('Search failed'));

      render(<ScheduleDetails schedule={mockSchedule} />, {
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

      expect((await screen.findAllByText('Search failed')).length).toBeGreaterThan(0);
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

  describe('Interval Selection', () => {
    test('does not show the create visit drawer before an interval is selected', async () => {
      await setup(mockSchedule);
      expect(screen.queryByText('New Calendar Event')).not.toBeInTheDocument();
    });

    test('opens the create visit drawer when an interval is selected', async () => {
      const user = userEvent.setup();
      await setup(mockSchedule);

      await user.click(screen.getByRole('button', { name: 'test-select-interval' }));

      expect(await screen.findByText('New Calendar Event')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Create Visit/i })).toBeInTheDocument();
    });

    test('shows an error instead of the drawer when the schedule has no practitioner', async () => {
      const user = userEvent.setup();
      await setup(locationOnlySchedule);

      await user.click(screen.getByRole('button', { name: 'test-select-interval' }));

      expect(await screen.findByText("Can't create visit without associated Practitioner")).toBeInTheDocument();
      expect(screen.queryByText('New Calendar Event')).not.toBeInTheDocument();
    });
  });

  describe('Slot Selection', () => {
    test('opens the create visit drawer when a free slot is selected', async () => {
      const user = userEvent.setup();
      await setup(mockSchedule, { slots: [createSlot({ status: 'free' })] });
      await screen.findByText('Available');

      await user.click(screen.getByRole('button', { name: 'test-select-slot' }));

      expect(await screen.findByText('New Calendar Event')).toBeInTheDocument();
    });

    test('ignores busy slots', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await setup(mockSchedule, { slots: [createSlot({ status: 'busy' })] });
      await screen.findByText('Blocked');

      await user.click(screen.getByRole('button', { name: 'test-select-slot' }));
      await settleDrawerTransitions();

      expect(screen.queryByText('New Calendar Event')).not.toBeInTheDocument();
    });

    test('shows an error when the schedule has no practitioner', async () => {
      const user = userEvent.setup();
      await setup(locationOnlySchedule, { slots: [createSlot({ status: 'free' })] });
      await screen.findByText('Available');

      await user.click(screen.getByRole('button', { name: 'test-select-slot' }));

      expect(await screen.findByText("Can't create visit without associated Practitioner")).toBeInTheDocument();
      expect(screen.queryByText('New Calendar Event')).not.toBeInTheDocument();
    });
  });

  describe('Appointment Selection', () => {
    test('opens the appointment details drawer when an appointment is selected', async () => {
      const user = userEvent.setup();
      await setup(mockSchedule, { appointments: [createAppointment()] });
      await screen.findByText(/John Doe/);

      await user.click(screen.getByRole('button', { name: 'test-select-appointment' }));

      expect(await screen.findByText('Appointment Details')).toBeInTheDocument();
    });

    test('shows an error when selecting an appointment that has not been saved', async () => {
      const user = userEvent.setup();
      const unsaved = createAppointment({ id: undefined });
      await setup(mockSchedule, { appointments: [unsaved] });
      await screen.findByText(/John Doe/);

      await user.click(screen.getByRole('button', { name: 'test-select-appointment' }));

      expect(await screen.findByText("Can't navigate to unsaved appointment")).toBeInTheDocument();
      expect(screen.queryByText('Appointment Details')).not.toBeInTheDocument();
    });
  });

  describe('Appointment Double Click', () => {
    test('navigates to the linked encounter', async () => {
      const user = userEvent.setup();
      medplum.searchOne = vi.fn().mockResolvedValue(linkedEncounter);
      await setup(mockSchedule, { appointments: [createAppointment()] });
      await screen.findByText(/John Doe/);

      await user.click(screen.getByRole('button', { name: 'test-double-click-appointment' }));

      expect(await screen.findByText('Encounter Page')).toBeInTheDocument();
      expect(medplum.searchOne).toHaveBeenCalledWith('Encounter', { appointment: 'Appointment/appointment-1' });
    });

    test('falls back to the details drawer when no encounter exists', async () => {
      const user = userEvent.setup();
      medplum.searchOne = vi.fn().mockResolvedValue(undefined);
      await setup(mockSchedule, { appointments: [createAppointment()] });
      await screen.findByText(/John Doe/);

      await user.click(screen.getByRole('button', { name: 'test-double-click-appointment' }));

      expect(await screen.findByText('Appointment Details')).toBeInTheDocument();
      expect(screen.queryByText('Encounter Page')).not.toBeInTheDocument();
    });

    test('shows an error when the encounter lookup fails', async () => {
      const user = userEvent.setup();
      medplum.searchOne = vi.fn().mockRejectedValue(new Error('Lookup failed'));
      await setup(mockSchedule, { appointments: [createAppointment()] });
      await screen.findByText(/John Doe/);

      await user.click(screen.getByRole('button', { name: 'test-double-click-appointment' }));

      expect(await screen.findByText('Lookup failed')).toBeInTheDocument();
      expect(screen.queryByText('Appointment Details')).not.toBeInTheDocument();
    });

    test('shows an error when double clicking an appointment that has not been saved', async () => {
      const user = userEvent.setup();
      const unsaved = createAppointment({ id: undefined });
      await setup(mockSchedule, { appointments: [unsaved] });
      await screen.findByText(/John Doe/);

      await user.click(screen.getByRole('button', { name: 'test-double-click-appointment' }));

      expect(await screen.findByText("Can't navigate to unsaved appointment")).toBeInTheDocument();
      expect(medplum.searchOne).not.toHaveBeenCalled();
    });
  });

  describe('Find Pane', () => {
    test('opens the details drawer for an appointment booked from the find pane', async () => {
      const user = userEvent.setup();
      await setup(mockSchedule);

      await user.click(await screen.findByRole('button', { name: 'test-book-success' }));

      expect(await screen.findByText('Appointment Details')).toBeInTheDocument();
    });

    test('applies the selected healthcare service availability to the calendar', async () => {
      const user = userEvent.setup();
      await setup(mockSchedule);
      expect(screen.getByTestId('available-time-count')).toHaveTextContent('none');

      await user.click(await screen.findByRole('button', { name: 'test-select-service' }));

      await waitFor(() => {
        expect(screen.getByTestId('available-time-count')).toHaveTextContent('1');
      });
      expect(screen.getByText('Wellness Service')).toBeInTheDocument();
    });
  });

  describe('Appointment Modifications', () => {
    const openDetails = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
      await screen.findByText(/John Doe/);
      await user.click(screen.getByRole('button', { name: 'test-select-appointment' }));
      await screen.findByText('Appointment Details');
    };

    test('closes the details drawer when the selected appointment is cancelled', async () => {
      const user = userEvent.setup();
      const appointment = createAppointment();
      await setup(mockSchedule, { appointments: [appointment] });
      await openDetails(user);

      act(() => {
        medplum.notifyResourceModified({
          resourceType: 'Appointment',
          operation: 'update',
          id: appointment.id,
          resource: { ...appointment, status: 'cancelled' },
        });
      });

      await waitFor(() => {
        expect(screen.queryByText('Appointment Details')).not.toBeInTheDocument();
      });
    });

    test('closes the details drawer when the selected appointment is deleted', async () => {
      const user = userEvent.setup();
      const appointment = createAppointment();
      await setup(mockSchedule, { appointments: [appointment] });
      await openDetails(user);

      act(() => {
        medplum.notifyResourceModified({ resourceType: 'Appointment', operation: 'delete', id: appointment.id });
      });

      await waitFor(() => {
        expect(screen.queryByText('Appointment Details')).not.toBeInTheDocument();
      });
    });

    test('keeps the drawer open when the selected appointment is updated to another status', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const appointment = createAppointment();
      await setup(mockSchedule, { appointments: [appointment] });
      await openDetails(user);

      act(() => {
        medplum.notifyResourceModified({
          resourceType: 'Appointment',
          operation: 'update',
          id: appointment.id,
          resource: { ...appointment, status: 'fulfilled' },
        });
      });
      await settleDrawerTransitions();

      expect(screen.getByText('Appointment Details')).toBeInTheDocument();
    });

    test('ignores modifications to other appointments', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const appointment = createAppointment();
      await setup(mockSchedule, { appointments: [appointment] });
      await openDetails(user);

      act(() => {
        medplum.notifyResourceModified({
          resourceType: 'Appointment',
          operation: 'update',
          id: 'someone-else',
          resource: { ...appointment, id: 'someone-else', status: 'cancelled' },
        });
      });
      await settleDrawerTransitions();

      expect(screen.getByText('Appointment Details')).toBeInTheDocument();
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
