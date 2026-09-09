// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Paper } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { Appointment } from '@medplum/fhirtypes';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { withFixtures, withMockedDate } from '../../stories/decorators';
import { RiveraImagingAppointment } from '../../stories/scheduling';
import { AppointmentDetails } from './AppointmentDetails';

const STORY_FIXTURES = [RiveraImagingAppointment];

export default {
  title: 'Medplum/SchedulingWorkspace/AppointmentDetails',
  component: AppointmentDetails,
  decorators: [withFixtures(STORY_FIXTURES), withMockedDate],
  parameters: {
    skipDefaultSeeding: true,
  },
} as Meta;

/**
 * Everything on file for one visit, and controls for managing the visit.
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
