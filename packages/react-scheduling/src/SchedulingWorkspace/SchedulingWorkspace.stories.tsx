// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { withFixtures, withMockedDate } from '../stories/decorators';
import { CalendarWeekFixtures, SchedulingFixtures } from '../stories/scheduling';
import { SchedulingWorkspace } from './SchedulingWorkspace';

const STORY_FIXTURES = [...SchedulingFixtures, ...CalendarWeekFixtures];

export default {
  title: 'Medplum/SchedulingWorkspace',
  component: SchedulingWorkspace,
  decorators: [withFixtures(STORY_FIXTURES), withMockedDate],
  parameters: {
    // Default seeding includes a lot of cluttering Slot resources for Dr. Alice Smith; skip it.
    skipDefaultSeeding: true,
  },
} as Meta;

/**
 * `CalendarWeekFixtures` gives providers, devices, and rooms booked and free time
 * across the week `MockDateWrapper` pins "today" to (Mon May 4 2020), so selecting
 * a few Providers/Devices/Rooms rows shows real events on the calendar.
 *
 * @returns The story.
 */
export const Basic = (): JSX.Element => (
  <div style={{ height: 700, padding: '1em' }}>
    <SchedulingWorkspace />
  </div>
);
