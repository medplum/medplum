// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box } from '@mantine/core';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { withFixtures } from '../stories/decorators';
import { ConfigFixtures } from '../stories/scheduling';
import { SchedulingConfigWorkspace } from './SchedulingConfigWorkspace';

export default {
  title: 'Medplum/SchedulingConfigWorkspace',
  component: SchedulingConfigWorkspace,
  parameters: {
    // Default seeding brings Dr. Alice Smith and her calendar, which only clutter the list here.
    skipDefaultSeeding: true,
  },
} as Meta;

function Workspace(): JSX.Element {
  // The workspace fills whatever it is given, so the story hands it the rest of the viewport.
  return (
    <Box style={{ height: 'calc(100vh - 72px)', padding: '1em', boxSizing: 'border-box' }}>
      <SchedulingConfigWorkspace />
    </Box>
  );
}

/**
 * The clinic as an admin sees it, including what booking hides.
 *
 * Initial Consultation is offered at both clinics, with prep and turnover time and a lunch break in its hours.
 * Group Education Class books eight patients into one weekly session. Telehealth Consult names no service facility,
 * so it is offered at every one. Unconfigured Visit and Walk-in Clinic have no duration, so booking never offers
 * them, but they are listed here to be finished. Discontinued Consult, Dr. Hana Lee, and Ultrasound 3 are turned
 * off, so they are hidden until **Show inactive** is ticked under the filters button. Exam Room C is listed though
 * it has no calendar.
 *
 * Rows carry what still needs finishing: Dr. Anika Patel's Walk-in Clinic hours have no time zone, and Procedure
 * Room is booked as a room without being marked as one.
 *
 * Pick one to edit it in place. Switching to another with unsaved changes asks first. The **+** beside Visit
 * types starts a new one, which is listed once it is saved. A visit type's Offered by opens the page of each
 * provider, room, or device offering it.
 *
 * @returns The story.
 */
export const Basic = (): JSX.Element => <Workspace />;
Basic.decorators = [withFixtures(ConfigFixtures)];
