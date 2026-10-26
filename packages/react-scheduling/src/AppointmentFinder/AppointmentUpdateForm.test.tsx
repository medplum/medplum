// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { getAppointmentSite, toAppointmentSiteReference } from '@medplum/core';
import type { Appointment, Parameters, Slot } from '@medplum/fhirtypes';
import type { MockClient } from '@medplum/mock';
import type { MockInstance } from 'vitest';
import { installFindStub } from '../stories/mockFind';
import { installRescheduleStub } from '../stories/mockReschedule';
import {
  ElderJordanPatient,
  ExamRoomBSchedule,
  MainClinic,
  MilesCooperPatient,
  RiveraImagingAppointment,
  RiveraImagingHeldSlots,
} from '../stories/scheduling';
import { installAutocompleteTimers, removePill, settleAutocomplete } from '../test-utils/asyncAutocomplete';
import {
  chooseActor,
  chooseFirstOfferedTime,
  choosePatient,
  MONDAY_MORNING,
  openTimeFinder,
  patientDetail,
  setupBookingClient,
} from '../test-utils/bookingForm';
import { act, fireEvent, renderWithMedplum, screen } from '../test-utils/render';
import type { AppointmentUpdateFormProps } from './AppointmentUpdateForm';
import { AppointmentUpdateForm } from './AppointmentUpdateForm';

installAutocompleteTimers();

/** The visit being changed, on the Tuesday after the clock the tests are frozen at. */
const APPOINTMENT: WithId<Appointment> = {
  ...RiveraImagingAppointment,
  start: '2026-08-18T15:00:00Z',
  end: '2026-08-18T15:30:00Z',
};

const HELD_SLOTS: WithId<Slot>[] = RiveraImagingHeldSlots.map((slot) => ({
  ...slot,
  start: APPOINTMENT.start as string,
  end: APPOINTMENT.end as string,
}));

async function setup(medplum: MockClient, props?: Partial<AppointmentUpdateFormProps>): Promise<void> {
  renderWithMedplum(<AppointmentUpdateForm appointment={APPOINTMENT} {...props} />, medplum);
  await settleAutocomplete();
}

async function clickUpdate(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Update Appointment' }));
  });
  await settleAutocomplete();
}

async function changePatient(): Promise<void> {
  await removePill('Miles Cooper');
  await choosePatient('Jordan', patientDetail(ElderJordanPatient, 'MRN-0041'));
}

function rescheduleCalls(post: MockInstance<MockClient['post']>): unknown[][] {
  return post.mock.calls.filter(([url]) => String(url).includes('$reschedule'));
}

/**
 * The updates that put the new patient on the visit. The `$reschedule` stub writes through
 * `updateResource` too, so the details' own write is told apart by what it carries.
 * @param update - The spy standing in front of the client's `updateResource`.
 * @returns The appointments written with the new patient.
 */
function detailWrites(update: MockInstance<MockClient['updateResource']>): WithId<Appointment>[] {
  return update.mock.calls
    .map(([resource]) => resource as WithId<Appointment>)
    .filter((resource) => isForJordan(resource));
}

function isForJordan(resource: unknown): boolean {
  return !!(resource as Appointment).participant?.some(
    (participant) => participant.actor?.reference === `Patient/${ElderJordanPatient.id}`
  );
}

describe('AppointmentUpdateForm', () => {
  let medplum: MockClient;
  let restoreFind: () => void;
  let restoreReschedule: () => void;

  beforeEach(async () => {
    vi.setSystemTime(MONDAY_MORNING);
    medplum = await setupBookingClient();
    await medplum.createResource(MilesCooperPatient);
    for (const slot of HELD_SLOTS) {
      await medplum.createResource(slot);
    }
    await medplum.createResource(APPOINTMENT);
    restoreFind = installFindStub(medplum);
    restoreReschedule = installRescheduleStub(medplum);
  });

  afterEach(() => {
    restoreReschedule();
    restoreFind();
  });

  test('offers no save until the time or the details change', async () => {
    await setup(medplum);

    expect(screen.getByRole('button', { name: 'Update Appointment' })).toBeDisabled();

    await changePatient();
    expect(screen.getByRole('button', { name: 'Update Appointment' })).toBeEnabled();
  });

  test('moves the visit alone with $reschedule and no update', async () => {
    const post = vi.spyOn(medplum, 'post');
    const update = vi.spyOn(medplum, 'updateResource');
    const onRescheduled = vi.fn();
    const onUpdated = vi.fn();
    const onSaved = vi.fn();
    await setup(medplum, { onRescheduled, onUpdated, onSaved });

    await openTimeFinder();
    await chooseFirstOfferedTime();
    await clickUpdate();

    expect(rescheduleCalls(post)).toHaveLength(1);
    expect(detailWrites(update)).toHaveLength(0);
    expect(onRescheduled).toHaveBeenCalledTimes(1);
    expect(onUpdated).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  test('moves the visit, then puts the details on the appointment the move returned', async () => {
    const post = vi.spyOn(medplum, 'post');
    const update = vi.spyOn(medplum, 'updateResource');
    const order: string[] = [];
    const onRescheduled = vi.fn(() => {
      order.push('rescheduled');
    });
    const onUpdated = vi.fn(() => {
      order.push('updated');
    });
    await setup(medplum, { onRescheduled, onUpdated });

    await changePatient();
    await openTimeFinder();
    await chooseFirstOfferedTime();
    await clickUpdate();

    expect(rescheduleCalls(post)).toHaveLength(1);
    expect(order).toEqual(['rescheduled', 'updated']);
    const moved = onRescheduled.mock.calls[0] as unknown as [{ appointments: WithId<Appointment>[] }];
    const [written] = detailWrites(update);
    // Built on the moved appointment, so it keeps the Slots the move took.
    expect(written.slot).toEqual(moved[0].appointments[0].slot);
    expect(written.slot).not.toEqual(APPOINTMENT.slot);
    expect(written.participant[0].actor?.reference).toBe(`Patient/${ElderJordanPatient.id}`);
  });

  test('stays open when the move goes through but the details do not, and retries only the details', async () => {
    const post = vi.spyOn(medplum, 'post');
    const updateResource = medplum.updateResource.bind(medplum);
    let refused = false;
    const update = vi.spyOn(medplum, 'updateResource').mockImplementation(async (resource, options) => {
      if (isForJordan(resource) && !refused) {
        refused = true;
        throw new Error('Precondition failed');
      }
      return updateResource(resource, options);
    });
    const onSaved = vi.fn();
    await setup(medplum, { onSaved });

    await changePatient();
    await openTimeFinder();
    await chooseFirstOfferedTime();
    await clickUpdate();

    expect(
      await screen.findByText(/The appointment was moved, but the patient and codes weren't saved\./)
    ).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Update Appointment' })).toBeEnabled();

    await clickUpdate();

    expect(rescheduleCalls(post)).toHaveLength(1);
    expect(detailWrites(update)).toHaveLength(2);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  test('moves the visit onto other actors at the time it already has', async () => {
    const post = vi.spyOn(medplum, 'post');
    const onRescheduled = vi.fn();
    await setup(medplum, { onRescheduled });

    expect(screen.getByRole('button', { name: 'Update Appointment' })).toBeDisabled();
    await removePill('Exam Room A');
    await chooseActor(/room/i, 'exam', 'Exam Room B');
    expect(screen.getByRole('button', { name: 'Update Appointment' })).toBeEnabled();
    await clickUpdate();

    const [call] = rescheduleCalls(post);
    const parameters = (call[1] as Parameters).parameter ?? [];
    const start = parameters.find((parameter) => parameter.name === 'start')?.valueDateTime as string;
    expect(Date.parse(start)).toBe(Date.parse(APPOINTMENT.start as string));
    expect(parameters.map((parameter) => parameter.valueReference?.reference)).toContain(
      `Schedule/${ExamRoomBSchedule.id}`
    );
    expect(onRescheduled).toHaveBeenCalledTimes(1);
  });

  test('opens on the site the visit is held at, and keeps it through a save', async () => {
    const update = vi.spyOn(medplum, 'updateResource');
    const atClinic = await medplum.updateResource({
      ...APPOINTMENT,
      supportingInformation: [toAppointmentSiteReference(MainClinic)],
    });
    update.mockClear();
    await setup(medplum, { appointment: atClinic });

    expect(screen.getByText(MainClinic.name as string)).toBeInTheDocument();

    await changePatient();
    await clickUpdate();

    const [written] = detailWrites(update);
    expect(getAppointmentSite(written)?.reference).toBe(`Location/${MainClinic.id}`);
  });

  test('offers no save while the actors cannot hold the visit', async () => {
    await setup(medplum);

    await removePill('Dr. Maya Rivera');

    expect(screen.getByRole('button', { name: 'Update Appointment' })).toBeDisabled();
  });

  test('goes back without saving', async () => {
    const onBack = vi.fn();
    await setup(medplum, { onBack });

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(onBack).toHaveBeenCalled();
  });

  test('keeps the time of a visit with no visit type, and still saves its details', async () => {
    const update = vi.spyOn(medplum, 'updateResource');
    const untyped = await medplum.updateResource({ ...APPOINTMENT, serviceType: undefined });
    update.mockClear();
    await setup(medplum, { appointment: untyped });

    expect(screen.getByText(/does not have a visit type/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /date & time/i })).toBeDisabled();

    await changePatient();
    await clickUpdate();

    expect(detailWrites(update)).toHaveLength(1);
  });
});
