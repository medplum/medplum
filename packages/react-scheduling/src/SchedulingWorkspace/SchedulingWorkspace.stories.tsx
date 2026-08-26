// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { withBookStub, withFindStub, withFixtures, withMockedDate } from '../stories/decorators';
import { CalendarWeekFixtures, PatientFixtures, SchedulingFixtures } from '../stories/scheduling';
import { SchedulingWorkspace } from './SchedulingWorkspace';

const STORY_FIXTURES = [...SchedulingFixtures, ...CalendarWeekFixtures, ...PatientFixtures];

export default {
  title: 'Medplum/SchedulingWorkspace',
  component: SchedulingWorkspace,
  decorators: [withBookStub(), withFindStub(), withFixtures(STORY_FIXTURES), withMockedDate],
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
 * Click — or drag over — open time on the grid and the booking form opens on the right,
 * headed with the day clicked. Choose "Ultrasound Imaging", then Dr. Maya Rivera, then
 * "Find a time": the search opens on that day rather than today, and the pane widens to
 * lay the times beside the form. Pick one, name a patient ("Jordan"), and book — the
 * pane closes and the appointment appears on the calendar without a reload, because the
 * booking announces what it wrote and the calendar is listening.
 *
 * Clicking a different day with the form part-filled re-opens it on the new day and
 * clears the answers; clicking again inside the day already open leaves them alone.
 *
 * @returns The story.
 */
export const Basic = (): JSX.Element => (
  // The workspace fills whatever it is given, so the story hands it the rest of the
  // viewport rather than a fixed height: the calendar and the booking pane both scroll
  // inside it, and a short host makes each of them look cramped for reasons of its own.
  // 72px is the package banner `withSchedulingHeader` puts above every story here.
  <div style={{ height: 'calc(100vh - 72px)', padding: '1em', boxSizing: 'border-box' }}>
    <SchedulingWorkspace />
  </div>
);
