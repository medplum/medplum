// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Appointment, Parameters, Slot } from '@medplum/fhirtypes';
import type { MockClient } from '@medplum/mock';
import type { JSX } from 'react';
import type { MockInstance } from 'vitest';
import { installFindStub } from '../stories/mockFind';
import { installRescheduleStub } from '../stories/mockReschedule';
import { RiveraImagingAppointment, RiveraImagingHeldSlots } from '../stories/scheduling';
import { installAutocompleteTimers, removePill, settleAutocomplete } from '../test-utils/asyncAutocomplete';
import {
  chooseActor,
  chooseFirstOfferedTime,
  chosenTimeField,
  hasPill,
  lastFindParams,
  MONDAY_MORNING,
  openTimeFinder,
  setupBookingClient,
} from '../test-utils/bookingForm';
import { act, fireEvent, renderWithMedplum, screen } from '../test-utils/render';
import type { AppointmentRescheduleFormProps } from './AppointmentRescheduleForm';
import { AppointmentRescheduleForm } from './AppointmentRescheduleForm';

installAutocompleteTimers();

/** The visit being moved, on the Tuesday after the clock the tests are frozen at. */
const APPOINTMENT: WithId<Appointment> = {
  ...RiveraImagingAppointment,
  start: '2026-08-18T15:00:00Z',
  end: '2026-08-18T15:30:00Z',
};

/** The times it holds, one per schedule it is booked against. */
const HELD_SLOTS: WithId<Slot>[] = RiveraImagingHeldSlots.map((slot) => ({
  ...slot,
  start: APPOINTMENT.start as string,
  end: APPOINTMENT.end as string,
}));

/** The schedules those times are on, which are the ones a move keeps unless it is told otherwise. */
const HELD_SCHEDULES = HELD_SLOTS.map((slot) => slot.schedule.reference as string);

/** Every mount needs one, and it is the only prop a host must supply besides the visit. */
const onRescheduled = vi.fn();

async function setupRescheduleClient(): Promise<MockClient> {
  const medplum = await setupBookingClient();
  for (const slot of HELD_SLOTS) {
    await medplum.createResource(slot);
  }
  await medplum.createResource(APPOINTMENT);
  return medplum;
}

/**
 * Mounts the form and waits for it to open on what the visit is held on.
 * @param medplum - The client to render against.
 * @param props - Anything to override.
 */
async function setup(medplum: MockClient, props?: Partial<AppointmentRescheduleFormProps>): Promise<void> {
  const element: JSX.Element = (
    <AppointmentRescheduleForm appointment={APPOINTMENT} onRescheduled={onRescheduled} {...props} />
  );
  renderWithMedplum(element, medplum);
  await settleAutocomplete();
}

/** Confirms the move. */
async function clickReschedule(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /reschedule appointment/i }));
  });
  await settleAutocomplete();
}

/** Finds a time and moves the visit to it, keeping everyone it is already held on. */
async function moveToAnotherTime(): Promise<void> {
  await openTimeFinder();
  await chooseFirstOfferedTime();
  await clickReschedule();
}

/**
 * What `$reschedule` was asked for.
 * @param post - The spy standing in front of the client's `post`.
 * @returns The input parameters of the last move, or undefined when none was asked for.
 */
function lastRescheduleParameters(post: MockInstance<MockClient['post']>): Parameters | undefined {
  const call = post.mock.calls.filter(([url]) => String(url).includes('reschedule')).at(-1);
  return call?.[1] as Parameters | undefined;
}

/**
 * One operation input, or all of a repeating one.
 * @param parameters - What was posted.
 * @param name - The parameter to read.
 * @returns Every value given under that name.
 */
function parameterValues(parameters: Parameters | undefined, name: string): unknown[] {
  return (parameters?.parameter ?? [])
    .filter((parameter) => parameter.name === name)
    .map((parameter) => parameter.valueDateTime ?? parameter.valueReference?.reference);
}

describe('AppointmentRescheduleForm', () => {
  let medplum: MockClient;
  let restoreFind: () => void;
  let restoreReschedule: () => void;

  beforeEach(async () => {
    vi.setSystemTime(MONDAY_MORNING);
    onRescheduled.mockClear();
    onRescheduled.mockResolvedValue(undefined);
    medplum = await setupRescheduleClient();
    restoreFind = installFindStub(medplum);
    restoreReschedule = installRescheduleStub(medplum);
  });

  afterEach(() => {
    restoreReschedule();
    restoreFind();
  });

  describe('Opening on the visit as it stands', () => {
    test('Fills in the visit type and everyone the visit is held on', async () => {
      // Read off the Slots the appointment holds: its participants would not say which
      // of an actor's schedules the visit is on.
      await setup(medplum);

      expect(screen.getByRole('textbox', { name: /visit type/i })).toHaveValue('Ultrasound Imaging');
      expect(hasPill(/Rivera/)).toBe(true);
      expect(hasPill(/Ultrasound 1/)).toBe(true);
      expect(hasPill(/Exam Room A/)).toBe(true);
      expect(screen.queryByText(/could not be read back/i)).not.toBeInTheDocument();
    });

    test('Says so when part of what holds the visit cannot be read back', async () => {
      // An actor left out of the fields is an actor a move would drop off the visit, so
      // a Slot or Schedule that cannot be read is called out rather than quietly skipped.
      const partial: WithId<Appointment> = {
        ...APPOINTMENT,
        id: 'appt-partly-readable',
        slot: [...(APPOINTMENT.slot ?? []).slice(0, 2), { reference: 'Slot/slot-nobody-can-read' }],
      };
      await medplum.createResource(partial);

      await setup(medplum, { appointment: partial });

      expect(screen.getByText(/could not be read back/i)).toBeInTheDocument();
      // And what could be read is still offered.
      expect(hasPill(/Rivera/)).toBe(true);
    });

    test('Shows the visit type it is on file for, rather than offering to change it', async () => {
      // `$reschedule` refuses a visit type the appointment is not on file for: changing what
      // a visit is would leave its required codes, its authorization and anything applied at
      // booking keyed to a type it no longer has.
      await setup(medplum);

      expect(screen.queryByRole('searchbox', { name: /visit type/i })).not.toBeInTheDocument();
      expect(screen.getByText(/needs a new booking/i)).toBeInTheDocument();
    });

    test('Asks for nothing a move cannot write', async () => {
      // `$reschedule` writes the time, the actors, and nothing else, so the patient and
      // the visit type's required codes are not asked for — they are already on file.
      await setup(medplum);

      expect(screen.queryByRole('searchbox', { name: /patient/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /book appointment/i })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /reschedule appointment/i })).toBeInTheDocument();
    });

    test('Opens on the form even where nothing can be read back', async () => {
      // A visit booked outside this flow records no service reference and holds no Slots
      // this viewer can read. Nothing is pre-filled and the whole form is still offered.
      const bare: WithId<Appointment> = { ...APPOINTMENT, id: 'appt-bare', serviceType: undefined, slot: undefined };
      await medplum.createResource(bare);

      await setup(medplum, { appointment: bare });

      // Nothing on file to contradict, and the search cannot run without one, so it is asked.
      expect(
        screen.getByText('This appointment does not have a visit type, and so cannot be rescheduled.')
      ).toBeInTheDocument();
    });
  });

  describe('Searching for a time to move to', () => {
    test('Searches as though the visit being moved were not there', async () => {
      // Without this the visit blocks its own move: the hour it occupies is busy on
      // every schedule holding it, so the same hour in another room finds nothing.
      const get = vi.spyOn(medplum, 'get');
      await setup(medplum);

      await openTimeFinder();

      expect(lastFindParams(get)?.get('ignore-appointment')).toBe(`Appointment/${APPOINTMENT.id}`);
    });

    test('Tells a host when the search opens, so a narrow one can make room for it', async () => {
      // The times lie beside the form rather than under it, and a drawer at its own width
      // is narrower than the two together.
      const onToggleTimeFinder = vi.fn();
      await setup(medplum, { onToggleTimeFinder });

      await openTimeFinder();

      expect(onToggleTimeFinder).toHaveBeenLastCalledWith(true);
    });

    test('Searches the schedules the visit is held on, until they are changed', async () => {
      const get = vi.spyOn(medplum, 'get');
      await setup(medplum);

      await openTimeFinder();

      expect(lastFindParams(get)?.getAll('schedule')).toEqual(expect.arrayContaining(HELD_SCHEDULES));
    });
  });

  describe('Moving the visit', () => {
    test('Moves it to the time chosen, on the schedules searched', async () => {
      const post = vi.spyOn(medplum, 'post');
      await setup(medplum);

      await moveToAnotherTime();

      const parameters = lastRescheduleParameters(post);
      const [appointment] = onRescheduled.mock.calls[0] as [{ appointment: Appointment }];
      expect(parameterValues(parameters, 'start')).toEqual([appointment.appointment.start]);
      expect(parameterValues(parameters, 'schedule')).toEqual(expect.arrayContaining(HELD_SCHEDULES));

      // The visit type is not sent: the operation reads the one the visit is on file for.
      expect(parameterValues(parameters, 'service-type-reference')).toEqual([]);
    });

    test('Reassigns a visit to another actor at the same hour', async () => {
      const post = vi.spyOn(medplum, 'post');
      await setup(medplum);

      // The provider and the device stay; only the room changes.
      await removePill(/Exam Room A/);
      await chooseActor(/room/i, 'Exam Room B', 'Exam Room B');
      await moveToAnotherTime();

      const schedules = parameterValues(lastRescheduleParameters(post), 'schedule');
      expect(schedules).toContain('Schedule/schedule-exam-room-b');
      expect(schedules).not.toContain('Schedule/schedule-exam-room-a');
    });

    test('Leaves the visit type on file, and the codes booked with it, alone', async () => {
      // `Appointment.serviceType` carries the procedure codes a designated visit type was
      // booked with, and the operation writes none of it — so neither does a move made here.
      await setup(medplum);

      await moveToAnotherTime();

      const [reschedule] = onRescheduled.mock.calls[0] as [{ appointment: Appointment }];
      expect(reschedule.appointment.serviceType).toStrictEqual(APPOINTMENT.serviceType);
    });

    test('Reports what the move wrote', async () => {
      await setup(medplum);

      await moveToAnotherTime();

      expect(onRescheduled).toHaveBeenCalledTimes(1);
      const [reschedule] = onRescheduled.mock.calls[0] as [{ appointment: Appointment; slots: Slot[] }];
      expect(reschedule.appointment.id).toBe(APPOINTMENT.id);
      expect(reschedule.appointment.start).not.toBe(APPOINTMENT.start);
      expect(reschedule.slots.length).toBe(HELD_SCHEDULES.length);
    });

    test('Announces the appointment, the times it gave up and the times it took', async () => {
      // `$reschedule` is a custom operation, so nothing else invalidates the caches a
      // host's own calendar reads from — and it both frees and reserves time.
      const notify = vi.spyOn(medplum, 'notifyResourceModified');
      await setup(medplum);

      await moveToAnotherTime();

      const announced = notify.mock.calls.map(([event]) => `${event.resourceType}:${event.operation}`);
      expect(announced).toContain('Appointment:update');
      for (const slot of HELD_SLOTS) {
        expect(notify).toHaveBeenCalledWith(
          expect.objectContaining({ resourceType: 'Slot', operation: 'delete', id: slot.id })
        );
      }
      expect(announced.filter((event) => event === 'Slot:create')).toHaveLength(HELD_SCHEDULES.length);
    });

    test('Keeps every answer on screen when the move is refused', async () => {
      // Usually somebody else taking the time, and the next attempt is one click away.
      vi.spyOn(medplum, 'post').mockRejectedValueOnce(new Error('That time is no longer available'));
      await setup(medplum);

      await moveToAnotherTime();

      expect(screen.getByText('That time is no longer available')).toBeInTheDocument();
      expect(chosenTimeField()).not.toBeNull();
      expect(onRescheduled).not.toHaveBeenCalled();
    });

    test('Reports a move the host callback threw over as written', async () => {
      // The visit has already moved by then, and a red refusal over it would read as a
      // visit still at its old time.
      const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      onRescheduled.mockRejectedValueOnce(new Error('Calendar refresh failed'));
      await setup(medplum);

      await moveToAnotherTime();

      expect(screen.queryByText('Calendar refresh failed')).not.toBeInTheDocument();
      expect(logged).toHaveBeenCalled();
      logged.mockRestore();
    });
  });
});
