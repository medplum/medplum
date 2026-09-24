// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Appointment, Slot } from '@medplum/fhirtypes';
import { Document } from '@medplum/react';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { withFindStub, withFixtures, withMockedDate, withRescheduleStub } from '../stories/decorators';
import {
  ImagingBenchFixtures,
  RiveraImagingAppointment,
  RiveraImagingHeldSlots,
  SchedulingFixtures,
} from '../stories/scheduling';
import type { AppointmentReschedule } from './AppointmentRescheduleForm';
import { AppointmentRescheduleForm } from './AppointmentRescheduleForm';

const STORY_FIXTURES = [
  ...SchedulingFixtures,
  ...ImagingBenchFixtures,
  ...RiveraImagingHeldSlots,
  RiveraImagingAppointment,
];

/** Times of its own, so moving the pending visit does not release the booked one's. */
const PendingHeldSlots: WithId<Slot>[] = RiveraImagingHeldSlots.map((slot) => ({
  ...slot,
  id: `${slot.id}-pending`,
  status: 'busy-tentative',
}));

/** A visit nobody has confirmed yet, which holds its time tentatively. */
const PendingAppointment: WithId<Appointment> = {
  ...RiveraImagingAppointment,
  id: 'appt-rivera-imaging-tue-pending',
  status: 'pending',
  slot: PendingHeldSlots.map((slot) => ({ reference: `Slot/${slot.id}` })),
};

export default {
  title: 'Medplum/AppointmentRescheduleForm',
  component: AppointmentRescheduleForm,
  decorators: [withRescheduleStub(), withFindStub(), withFixtures(STORY_FIXTURES), withMockedDate],
} as Meta;

/**
 * Moving a booked visit, mounted the way a host mounts it: the appointment and a
 * callback.
 *
 * It opens on what the visit is held on now — "Ultrasound Imaging" with Dr. Rivera,
 * Ultrasound 1 and Exam Room A — read off the Slots the appointment holds rather than
 * off its participants, since a participant does not say which of an actor's schedules
 * the visit sits on. The visit type is shown rather than offered: `$reschedule` will not
 * change what a visit is, only when it is and who holds it.
 *
 * Two things to try:
 *
 * - **Reassign.** Swap Exam Room A for Exam Room B, leaving everyone else, and find a
 *   time. The visit's own hour is offered again: `$find` is told to ignore this
 *   appointment, so the Slots it is holding do not block the move. Without that, the
 *   same hour in a different room could never be found — Dr. Rivera is busy then, with
 *   the very visit being moved.
 * - **Reschedule.** Change nothing and pick another day.
 *
 * Nothing else about the visit is asked for. The patient, the status, the visit type and
 * anything clinical on it stay as they are, because `$reschedule` writes the time, the
 * actors, and nothing more.
 *
 * @returns The story.
 */
export const Basic = (): JSX.Element => {
  const [appointment, setAppointment] = useState<WithId<Appointment>>(RiveraImagingAppointment);

  return (
    <Document>
      <AppointmentRescheduleForm appointment={appointment} onRescheduled={reportReschedule(setAppointment)} />
    </Document>
  );
};

/**
 * The same form over a visit still waiting to be confirmed.
 *
 * A `pending` visit holds its time tentatively, and moving it keeps that: the Slots it
 * takes at the new time are `busy-tentative`, as the ones it gave up were.
 *
 * @returns The story.
 */
export const PendingVisit = (): JSX.Element => {
  const [appointment, setAppointment] = useState<WithId<Appointment>>(PendingAppointment);

  return (
    <Document>
      <AppointmentRescheduleForm appointment={appointment} onRescheduled={reportReschedule(setAppointment)} />
    </Document>
  );
};
PendingVisit.decorators = [withFixtures([...PendingHeldSlots, PendingAppointment])];

/**
 * A visit with nothing free to move to.
 *
 * "No times are available for this selection" — the same dead end a booking reaches,
 * and the visit stays where it is.
 *
 * @returns The story.
 */
export const NoAvailability = (): JSX.Element => (
  <Document>
    <AppointmentRescheduleForm appointment={RiveraImagingAppointment} onRescheduled={() => undefined} />
  </Document>
);
NoAvailability.decorators = [withFindStub({ empty: true })];

/**
 * Stands in for the host, which is the only thing a story has to supply.
 * @param setAppointment - Puts the moved visit back on screen, as a host's own data would.
 * @returns The callback.
 */
function reportReschedule(
  setAppointment: (appointment: WithId<Appointment>) => void
): (reschedule: AppointmentReschedule) => void {
  return (reschedule) => {
    console.info('Rescheduled', reschedule.appointment.id, `onto ${reschedule.slots.length} slot(s)`);
    setAppointment(reschedule.appointment);
  };
}
