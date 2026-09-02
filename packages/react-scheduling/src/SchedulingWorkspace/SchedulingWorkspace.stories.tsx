// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { showNotification } from '@mantine/notifications';
import type { Appointment } from '@medplum/fhirtypes';
import type { Meta } from '@storybook/react';
import { IconCalendarCheck } from '@tabler/icons-react';
import type { JSX } from 'react';
import { withBookStub, withFindStub, withFixtures, withMockedDate } from '../stories/decorators';
import { CalendarWeekFixtures, inViewerTimezone, PatientFixtures, SchedulingFixtures } from '../stories/scheduling';
import { SchedulingWorkspace } from './SchedulingWorkspace';

/** The clinic as the fixtures keep it: Dr. Rivera in Eastern time, Dr. Okafor in Central. */
const ELSEWHERE_FIXTURES = [...SchedulingFixtures, ...CalendarWeekFixtures, ...PatientFixtures];

/** The same clinic, moved onto whatever clock the reader is on. */
const LOCAL_FIXTURES = inViewerTimezone(ELSEWHERE_FIXTURES);

// Fixtures are per story rather than shared here: the two stories differ in nothing but
// the zones theirs declare, and a set installed for both would decide that for both.
export default {
  title: 'Medplum/SchedulingWorkspace',
  component: SchedulingWorkspace,
  decorators: [withBookStub(), withFindStub(), withMockedDate],
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
 * booking announces what it wrote and the calendar is listening. The toast naming the
 * visit is this story's, raised from `onBooked`: the workspace reports what was booked
 * and leaves how to say so to whatever is hosting it.
 *
 * Clicking a different day with the form part-filled re-opens it on the new day and
 * clears the answers; clicking again inside the day already open leaves them alone.
 *
 * Everything here is kept on your own clock, so no time names a zone and nothing is
 * said under the calendar. `From A Different Timezone` is the same clinic scheduled
 * somewhere else.
 *
 * @returns The story.
 */
export const Basic = (): JSX.Element => <Workspace />;
Basic.decorators = [withFixtures(LOCAL_FIXTURES)];

/**
 * The same workspace when the calendars are not kept on the viewer's clock.
 *
 * Dr. Rivera is scheduled in Eastern time and Dr. Okafor in Central. The line under
 * the grid names the clock it is drawn on — yours — whenever a calendar on show is
 * kept in another. Deselect both providers and the line goes, because the rooms and
 * devices never declared a zone.
 *
 * Click open time, choose Ultrasound Imaging and Dr. Maya Rivera, then Find a time.
 * The times are Rivera's Eastern hours, labelled ET, and the form writes the same zone
 * on the one it keeps.
 *
 * A reader on Eastern time is the exception this cannot stage: the calendars are then
 * on their clock after all, and the story reads like `Basic`.
 *
 * @returns The story.
 */
export const FromADifferentTimezone = (): JSX.Element => <Workspace />;
FromADifferentTimezone.decorators = [withFixtures(ELSEWHERE_FIXTURES)];

/**
 * Fills the viewport under the package banner, which is 72px.
 * @returns The workspace as a host would mount it.
 */
function Workspace(): JSX.Element {
  // The workspace fills whatever it is given, so the story hands it the rest of the
  // viewport rather than a fixed height: the calendar and the booking pane both scroll
  // inside it, and a short host makes each of them look cramped for reasons of its own.
  return (
    <div style={{ height: 'calc(100vh - 72px)', padding: '1em', boxSizing: 'border-box' }}>
      <SchedulingWorkspace
        onBooked={({ appointment }) => {
          showNotification({
            color: 'green',
            icon: <IconCalendarCheck size={18} />,
            title: 'Appointment booked',
            message: describeBooking(appointment),
          });
        }}
      />
    </div>
  );
}

/**
 * Names the visit that was booked, for the notification announcing it.
 * @param appointment - The appointment `$book` wrote.
 * @returns Who it is for and when, as far as each is known.
 */
function describeBooking(appointment: Appointment): string {
  const patient = (appointment.participant ?? []).find((participant) =>
    participant.actor?.reference?.startsWith('Patient/')
  );
  const when = appointment.start
    ? new Date(appointment.start).toLocaleString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : undefined;
  return [patient?.actor?.display, when].filter(Boolean).join(' · ');
}
