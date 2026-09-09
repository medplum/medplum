// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Paper } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { Appointment } from '@medplum/fhirtypes';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { APPOINTMENT_CANCELLATION_REASON_CODE_SYSTEM } from '../../constants';
import { withCancelStub, withFixtures, withMockedDate, withValueSetStub } from '../../stories/decorators';
import { RiveraImagingAppointment } from '../../stories/scheduling';
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

const STORY_FIXTURES = [RiveraImagingAppointment, CancelledAppointment];

export default {
  title: 'Medplum/SchedulingWorkspace/AppointmentDetails',
  component: AppointmentDetails,
  decorators: [
    // Mock out the `$cancel` operation in our MockClient
    withCancelStub(),
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
 * - Cancelling: requires selecting a `cancelationReason` from the
 *   `appointment-cancellation-reason` value set, which is sent as part of a
 *   `$cancel` request.
 *
 * - Controls for rescheduling/reassigning coming soon!
 *
 * @returns The story.
 */
export const Basic = (): JSX.Element => {
  const [appointment, setAppointment] = useState<WithId<Appointment>>(RiveraImagingAppointment);

  return (
    <Paper withBorder p="md" maw={320}>
      <AppointmentDetails appointment={appointment} onCancelled={setAppointment} />
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
