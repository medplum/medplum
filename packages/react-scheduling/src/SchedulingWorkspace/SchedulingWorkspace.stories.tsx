// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { showNotification } from '@mantine/notifications';
import type { Appointment } from '@medplum/fhirtypes';
import type { Meta } from '@storybook/react';
import { IconCalendarCancel, IconCalendarCheck, IconCalendarEvent } from '@tabler/icons-react';
import type { JSX } from 'react';
import {
  withBookStub,
  withCancelStub,
  withFindStub,
  withFixtures,
  withMockedDate,
  withRescheduleStub,
  withValueSets,
} from '../stories/decorators';
import { CancellationReasonValueSets } from '../stories/mockValueSet';
import {
  AppointmentPatientFixtures,
  AuthorizationValueSets,
  CalendarWeekFixtures,
  DIAGNOSIS_VALUE_SET,
  ImagingBenchFixtures,
  inViewerTimezone,
  PatientFixtures,
  PROCEDURE_VALUE_SET,
  SchedulingFixtures,
} from '../stories/scheduling';
import { SchedulingWorkspace } from './SchedulingWorkspace';

/**
 * The clinic as the fixtures keep it: Dr. Rivera in Eastern time, Dr. Okafor in Central.
 *
 * `ImagingBenchFixtures` adds four more providers who declare no zone and hold no
 * appointments. They are here to be *named* rather than watched — a booking form
 * asking for "either of these, and any of those" needs a pool to draw from, and two
 * providers is not one. Their calendars come up empty, which is what deselecting is for.
 */
const ELSEWHERE_FIXTURES = [
  ...SchedulingFixtures,
  ...ImagingBenchFixtures,
  ...CalendarWeekFixtures,
  ...PatientFixtures,
  ...AppointmentPatientFixtures,
];

/** The same clinic, moved onto whatever clock the reader is on. */
const LOCAL_FIXTURES = inViewerTimezone(ELSEWHERE_FIXTURES);

// Fixtures are per story rather than shared here: the two stories differ in nothing but
// the zones theirs declare, and a set installed for both would decide that for both.
export default {
  title: 'Medplum/SchedulingWorkspace',
  component: SchedulingWorkspace,
  decorators: [
    withBookStub(),
    withCancelStub(),
    withRescheduleStub(),
    // Cancellation reasons, plus the code value sets for visit types that ask for codes.
    withValueSets({ ...CancellationReasonValueSets, ...AuthorizationValueSets }),
    withFindStub(),
    withMockedDate,
  ],
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
 * The grid marks the time being booked, and the mark follows the answers: picking a time
 * in the search moves it there, and searching another day takes it down. Hovering open
 * time marks nothing — a whole-column tint cannot say which time is under the pointer.
 * The calendar never moves itself to keep the mark in sight; page to a week the marked
 * time is on and it is there.
 *
 * Clicking a different day with the form part-filled re-opens it on the new day and
 * clears the answers; clicking again inside the day already open leaves them alone.
 *
 * Clicking a booked appointment instead — the Tuesday and Wednesday imaging visits, or
 * anything booked from the form — opens its details in the same pane the booking form
 * uses, closing the form if one was open; clicking open time again puts the form back.
 * "Cancel Appointment" turns the pane over to a page asking what the visit is being
 * called off for; a reason has to be searched for and picked before it can be confirmed,
 * and "Back" leaves without touching the visit. Confirming runs it through
 * `Appointment/:id/$cancel`: the pane lands back on the details, now describing a
 * cancelled appointment, showing the reason and with no button left on it, and the event
 * beside it is drawn as cancelled without a reload, because the cancellation announces
 * what it wrote the way booking does.
 *
 * Thursday's infusion on Dr. Chen's calendar (select **Providers → Dr. Wei Chen**) is booked
 * for a visit type asking for procedure codes, diagnosis codes, and a medical necessity
 * attestation, so its details offer all three for editing beside the patient. Booking
 * **Infusion Therapy** from the form asks for the same three.
 *
 * The same drawer offers to move the visit. "Reschedule" swaps the details for the form
 * that finds it another time, opened on the visit type and the actors it is held on —
 * for Tuesday's imaging visit, Dr. Rivera, Ultrasound 1 and Exam Room A. Swap the room
 * and find a time and its own hour is offered again, since the search is told to ignore
 * the visit being moved. Move it and the drawer goes back to the details, with the event
 * redrawn at its new time behind them.
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
 * The workspace when the host lets a user enter a time of their own.
 *
 * Everything in `Basic` still works: a time picked from the search is booked through
 * `$book`, which checks it. What this adds is a **Date & time** and a **Minutes** field
 * above the times on offer, for placing a visit the rules would refuse. The read-only
 * time on the left stays where it is; both ways of answering land in it.
 *
 * To see a clash: select **Providers → Dr. Maya Rivera**, and find her booked imaging
 * visit for Miles Cooper on the Tuesday. Click any open time to open the form, choose
 * **Ultrasound Imaging** and **Dr. Maya Rivera**, then **Find a time**. Above the times
 * that come back, type that Tuesday and *the time the visit on the calendar starts* —
 * read it off the event rather than copying a time from here, since the fixtures are
 * kept on your own clock. A line appears under the fields:
 *
 * > Overlaps an existing appointment on Dr. Maya Rivera's schedule
 *
 * It names the calendar, not the patient on it. **It does not stop you booking**: the
 * point is to show what you are sitting on top of, not to refuse. Book it and a second
 * visit appears over the first.
 *
 * Blocked time reads differently. Select **Rooms → Exam Room A**, which is closed
 * Thursday for equipment maintenance, and type a time inside it:
 *
 * > Overlaps blocked time on Exam Room A's schedule
 *
 * Nothing warns while the fields are incomplete, and the warning is taken down the
 * moment any of them changes, because what was looked up was about a different time.
 *
 * Two things happen out of sight. A typed time is written directly as a transaction
 * rather than through `$book`, which would refuse it, and the appointment it writes
 * carries a `SchedulingUnvalidatedBooking` extension — the only durable record that
 * the rules were not applied to it.
 *
 * @returns The story.
 */
export const BypassSchedulingRules = (): JSX.Element => <Workspace canBypassSchedulingRules />;
BypassSchedulingRules.decorators = [withFixtures(LOCAL_FIXTURES)];

interface WorkspaceProps {
  readonly canBypassSchedulingRules?: boolean;
}

/**
 * Fills the viewport under the package banner, which is 72px.
 * @param props - Whether the story lets a time be typed.
 * @returns The workspace as a host would mount it.
 */
function Workspace(props: WorkspaceProps): JSX.Element {
  // The workspace fills whatever it is given, so the story hands it the rest of the
  // viewport rather than a fixed height: the calendar and the booking pane both scroll
  // inside it, and a short host makes each of them look cramped for reasons of its own.
  return (
    <div style={{ height: 'calc(100vh - 72px)', padding: '1em', boxSizing: 'border-box' }}>
      <SchedulingWorkspace
        canBypassSchedulingRules={props.canBypassSchedulingRules}
        procedureBinding={PROCEDURE_VALUE_SET}
        diagnosisBinding={DIAGNOSIS_VALUE_SET}
        onBooked={({ appointment }) => {
          showNotification({
            color: 'green',
            icon: <IconCalendarCheck size={18} />,
            title: 'Appointment booked',
            message: describeBooking(appointment),
          });
        }}
        onCancelled={(appointment) => {
          showNotification({
            color: 'red',
            icon: <IconCalendarCancel size={18} />,
            title: 'Appointment cancelled',
            message: describeBooking(appointment),
          });
        }}
        onRescheduled={({ appointment }) => {
          showNotification({
            color: 'blue',
            icon: <IconCalendarEvent size={18} />,
            title: 'Appointment rescheduled',
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
