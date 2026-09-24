// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Paper } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { Appointment } from '@medplum/fhirtypes';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { APPOINTMENT_CANCELLATION_REASON_CODE_SYSTEM } from '../../constants';
import {
  withCancelStub,
  withFindStub,
  withFixtures,
  withMockedDate,
  withRescheduleStub,
  withValueSetStub,
} from '../../stories/decorators';
import { RiveraImagingAppointment, RiveraImagingHeldSlots, SchedulingFixtures } from '../../stories/scheduling';
import { AppointmentDetails } from './AppointmentDetails';

const CancelledAppointment: WithId<Appointment> = {
  ...RiveraImagingAppointment,
  id: 'appt-rivera-imaging-tue-cancelled',
  status: 'cancelled',
  cancelationReason: {
    coding: [
      {
        system: APPOINTMENT_CANCELLATION_REASON_CODE_SYSTEM,
        code: 'pat-fb',
        display: 'Patient: Feeling Better',
      },
    ],
  },
};

// The schedules, the visit type and the actors as well as the visits themselves: moving
// a visit searches against all of them.
const STORY_FIXTURES = [
  ...SchedulingFixtures,
  ...RiveraImagingHeldSlots,
  RiveraImagingAppointment,
  CancelledAppointment,
];

export default {
  title: 'Medplum/SchedulingWorkspace/AppointmentDetails',
  component: AppointmentDetails,
  decorators: [
    // Mock out the `$cancel` operation in our MockClient
    withCancelStub(),
    // Rescheduling searches with `$find` and writes with `$reschedule`, neither of
    // which MockClient answers either.
    withRescheduleStub(),
    withFindStub(),
    // We use a ValueSet (`appointment-cancellation-reason`) that is not
    // preloaded in the MockClient, so we set up a value set stub.
    withValueSetStub(),
    withFixtures(STORY_FIXTURES),
    withMockedDate,
  ],
  parameters: {
    skipDefaultSeeding: true,
  },
} as Meta;

/**
 * Everything on file for one visit, and controls for managing the visit.
 *
 * - Cancelling: "Cancel Appointment" turns the view over to a page of its own, which
 *   requires selecting a `cancelationReason` from the `appointment-cancellation-reason`
 *   value set before it can be confirmed, and sends it as part of a `$cancel` request.
 *   "Back" returns to the details without cancelling anything, and without keeping the
 *   reason that was chosen.
 *
 * - Rescheduling: swaps this view for the form that moves the visit, opened on the
 *   visit type and the actors it is held on now — Dr. Rivera, Ultrasound 1 and Exam
 *   Room A, read back off the Slots it holds. Change any of the actors, or none of
 *   them, find a time, and `$reschedule` moves the visit to it. The search ignores this
 *   appointment's own Slots, so the hour it already occupies is offered again: that
 *   is what makes "same time, different room" findable. The visit type is shown but
 *   not editable — a move never changes what a visit is.
 *
 *   The times lie beside that form rather than under it, so this panel widens while the
 *   search is open — `onToggleTimeFinder` is what tells a host when to make the room.
 *   The `SchedulingWorkspace` widens its drawer on the same signal.
 *
 * @returns The story.
 */
export const Basic = (): JSX.Element => {
  const [appointment, setAppointment] = useState<WithId<Appointment>>(RiveraImagingAppointment);
  const [searching, setSearching] = useState(false);

  return (
    <Paper withBorder p="md" maw={searching ? 800 : 460}>
      <AppointmentDetails
        appointment={appointment}
        onCancelled={setAppointment}
        onRescheduled={(reschedule) => setAppointment(reschedule.appointment)}
        onToggleTimeFinder={setSearching}
      />
    </Paper>
  );
};

/**
 * A visit that has already been called off: `$cancel` would refuse it, so there is no
 * button and it says as much.
 *
 * @returns The story.
 */
export const Cancelled = (): JSX.Element => (
  <Paper withBorder p="md" maw={320}>
    <AppointmentDetails appointment={CancelledAppointment} />
  </Paper>
);
