// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import type { Appointment, ResourceType, Schedule, Slot } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import type * as ReactScheduling from '@medplum/react-scheduling';
import { act, render, screen, waitFor } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ScheduleDetails } from './ScheduleDetails';

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
      <button type="button" onClick={() => props.onSelectInterval?.({ start: new Date(), end: new Date() })}>
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
    </>
  );
  return { ...actual, Calendar: TestCalendar };
});

vi.mock('./FindPane', () => ({
  FindPane: (props: { onSuccess: (results: { appointment: WithId<Appointment>; slots: Slot[] }) => void }) => (
    <button
      type="button"
      onClick={() =>
        props.onSuccess({
          appointment: { resourceType: 'Appointment', id: 'booked', status: 'booked', participant: [] },
          slots: [],
        })
      }
    >
      test-book-success
    </button>
  ),
}));

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
    notifications.clean();

    mockSchedule = {
      resourceType: 'Schedule',
      id: 'schedule-1',
      actor: [{ reference: 'Practitioner/practitioner-1' }],
      active: true,
    };

    // Store the schedule so readResource('Schedule', 'schedule-1') works
    await medplum.createResource(mockSchedule);
    medplum.searchOne = vi.fn().mockResolvedValue(undefined);
    medplum.searchResources = vi.fn().mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
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
              <Routes>
                <Route path="/" element={children} />
                <Route path="/Patient/:patientId/Encounter/:encounterId" element={<div>Encounter Page</div>} />
              </Routes>
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

  /** Lets Mantine's drawer transitions finish under fake timers before a negative drawer assertion. */
  const settleDrawerTransitions = async (): Promise<void> => {
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
  };

  const openAppointment = async (user: UserEvent, action: string, appointment = createAppointment()): Promise<void> => {
    await setup(mockSchedule, { appointments: [appointment] });
    await screen.findByText(/John Doe/);
    await user.click(screen.getByRole('button', { name: `test-${action}-appointment` }));
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

    test('opens the create visit drawer when a free slot or an interval is selected', async () => {
      const user = userEvent.setup();
      await setup(mockSchedule, { slots: [createSlot()] });
      await screen.findByText('Available');

      await user.click(screen.getByRole('button', { name: 'test-select-slot' }));
      expect(await screen.findByText('New Calendar Event')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'test-select-interval' }));
      expect(screen.getByRole('button', { name: /Create Visit/i })).toBeInTheDocument();
    });

    test('shows an error instead of the drawer when the schedule has no practitioner', async () => {
      const user = userEvent.setup();
      await setup({ ...mockSchedule, actor: [{ reference: 'Location/room-1' }] }, { slots: [createSlot()] });
      await screen.findByText('Available');

      await user.click(screen.getByRole('button', { name: 'test-select-interval' }));
      expect(await screen.findByText("Can't create visit without associated Practitioner")).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'test-select-slot' }));
      await waitFor(() => {
        expect(screen.getAllByText("Can't create visit without associated Practitioner")).toHaveLength(2);
      });
      expect(screen.queryByText('New Calendar Event')).not.toBeInTheDocument();
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
  });

  describe('View Changes', () => {
    test('renders view switcher buttons', async () => {
      await setup(mockSchedule);
      expect(screen.getByText('Month')).toBeInTheDocument();
      expect(screen.getByText('Week')).toBeInTheDocument();
      expect(screen.getByText('Day')).toBeInTheDocument();
    });
  });

  describe('Appointment Selection', () => {
    test('shows an error when selecting or double clicking an appointment that has not been saved', async () => {
      const user = userEvent.setup();
      await openAppointment(user, 'select', createAppointment({ id: undefined }));
      expect(await screen.findByText("Can't navigate to unsaved appointment")).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'test-double-click-appointment' }));
      await waitFor(() => {
        expect(screen.getAllByText("Can't navigate to unsaved appointment")).toHaveLength(2);
      });
      expect(screen.queryByText('Appointment Details')).not.toBeInTheDocument();
      expect(medplum.searchOne).not.toHaveBeenCalled();
    });

    test('navigates to the linked encounter on double click', async () => {
      const user = userEvent.setup();
      medplum.searchOne = vi.fn().mockResolvedValue({
        resourceType: 'Encounter',
        id: 'encounter-1',
        status: 'in-progress',
        class: { code: 'AMB' },
        subject: { reference: 'Patient/123' },
      });
      await openAppointment(user, 'double-click');

      expect(await screen.findByText('Encounter Page')).toBeInTheDocument();
      expect(medplum.searchOne).toHaveBeenCalledWith('Encounter', { appointment: 'Appointment/appointment-1' });
    });

    test('falls back to the details drawer on double click when no encounter exists', async () => {
      const user = userEvent.setup();
      await openAppointment(user, 'double-click');

      expect(await screen.findByText('Appointment Details')).toBeInTheDocument();
      expect(screen.queryByText('Encounter Page')).not.toBeInTheDocument();
    });

    test('shows an error when the encounter lookup fails', async () => {
      const user = userEvent.setup();
      medplum.searchOne = vi.fn().mockRejectedValue(new Error('Lookup failed'));
      await openAppointment(user, 'double-click');

      expect(await screen.findByText('Lookup failed')).toBeInTheDocument();
      expect(screen.queryByText('Appointment Details')).not.toBeInTheDocument();
    });

    test('opens the details drawer for an appointment booked from the find pane', async () => {
      const user = userEvent.setup();
      await setup(mockSchedule);
      await user.click(await screen.findByRole('button', { name: 'test-book-success' }));
      expect(await screen.findByText('Appointment Details')).toBeInTheDocument();
    });
  });

  describe('Appointment Modifications', () => {
    const appointment = createAppointment();

    const modifyWhileOpen = async (user: UserEvent, resource: WithId<Appointment>): Promise<void> => {
      await openAppointment(user, 'select', appointment);
      await screen.findByText('Appointment Details');
      act(() => {
        medplum.notifyResourceModified({ resourceType: 'Appointment', operation: 'update', id: resource.id, resource });
      });
    };

    test('closes the details drawer when the selected appointment is cancelled', async () => {
      const user = userEvent.setup();
      await modifyWhileOpen(user, { ...appointment, status: 'cancelled' });
      await waitFor(() => {
        expect(screen.queryByText('Appointment Details')).not.toBeInTheDocument();
      });
    });

    test('keeps the drawer open when the selected appointment is updated to another status', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await modifyWhileOpen(user, { ...appointment, status: 'fulfilled' });
      await settleDrawerTransitions();
      expect(screen.getByText('Appointment Details')).toBeInTheDocument();
    });

    test('ignores modifications to other appointments', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await modifyWhileOpen(user, { ...appointment, id: 'someone-else', status: 'cancelled' });
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
