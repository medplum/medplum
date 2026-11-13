// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { showNotification } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import {
  createReference,
  SchedulingColorURI,
  setPrimaryProvider,
  toAppointmentSiteReference,
  toServiceTypeCodeableConcepts,
} from '@medplum/core';
import type { Appointment, Patient, Reference, Resource, Slot } from '@medplum/fhirtypes';
import type { Meta } from '@storybook/react';
import { IconCalendarCancel, IconCalendarCheck, IconCalendarEvent } from '@tabler/icons-react';
import type { JSX } from 'react';
import {
  withBookStub,
  withCancelStub,
  withConfirmStub,
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
  DrRiveraPractitioner,
  DrRiveraSchedule,
  ImagingBenchFixtures,
  inViewerTimezone,
  PatientFixtures,
  PROCEDURE_VALUE_SET,
  SatelliteClinic,
  SatelliteRoom,
  SatelliteRoomSchedule,
  SchedulingFixtures,
  TelehealthService,
  UltrasoundImagingService,
} from '../stories/scheduling';
import type { SchedulingWorkspaceProps } from './SchedulingWorkspace';
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

/**
 * The same clinic, moved onto whatever clock the reader is on, with Telehealth Consult naming the
 * color it is drawn in.
 */
const LOCAL_FIXTURES = inViewerTimezone(ELSEWHERE_FIXTURES).map((resource) =>
  resource.resourceType === 'HealthcareService' && resource.id === TelehealthService.id
    ? {
        ...resource,
        extension: [...(resource.extension ?? []), { url: SchedulingColorURI, valueString: 'grape' }],
      }
    : resource
);

/**
 * An imaging visit Dr. Rivera holds at the satellite, in its exam room, with the Slots it holds there.
 * @param id - The appointment's id, which its Slots' are made from.
 * @param patient - Who the visit is for.
 * @param start - When it starts, on the viewer's clock.
 * @param minutes - How long it lasts.
 * @returns The Slots and the appointment.
 */
function riveraAtSatellite(id: string, patient: Reference<Patient>, start: Date, minutes: number): Resource[] {
  const end = new Date(start.getTime() + minutes * 60_000);
  const slots = [DrRiveraSchedule, SatelliteRoomSchedule].map((schedule): WithId<Slot> => ({
    resourceType: 'Slot',
    id: `${id}-${schedule.id}`,
    status: 'busy',
    start: start.toISOString(),
    end: end.toISOString(),
    schedule: createReference(schedule),
  }));
  const rivera = createReference(DrRiveraPractitioner);
  const appointment: WithId<Appointment> = {
    resourceType: 'Appointment',
    id,
    status: 'booked',
    start: start.toISOString(),
    end: end.toISOString(),
    serviceType: toServiceTypeCodeableConcepts(UltrasoundImagingService),
    slot: slots.map(createReference),
    supportingInformation: [toAppointmentSiteReference(SatelliteClinic)],
    participant: setPrimaryProvider(
      [
        { status: 'accepted', actor: patient },
        { status: 'accepted', actor: rivera },
        { status: 'accepted', actor: createReference(SatelliteRoom) },
      ],
      rivera
    ),
  };
  return [...slots, appointment];
}

/**
 * Dr. Rivera's imaging visits at the satellite, on Wednesday morning and Thursday afternoon, though no role
 * places Dr. Rivera there.
 */
const RIVERA_SATELLITE_VISITS = [
  ...riveraAtSatellite(
    'appt-rivera-satellite-wed',
    { reference: 'Patient/pt-novak', display: 'Theo Novak' },
    new Date(2020, 4, 6, 9),
    45
  ),
  ...riveraAtSatellite(
    'appt-rivera-satellite-thu',
    { reference: 'Patient/pt-shah', display: 'Priya Shah' },
    new Date(2020, 4, 7, 14, 30),
    30
  ),
];

// Fixtures are per story rather than shared here: the clinic's stories differ in the zones
// theirs declare, and Basic adds Dr. Rivera's satellite visits, and a set installed for all
// would decide that for all.
export default {
  title: 'Medplum/SchedulingWorkspace',
  component: SchedulingWorkspace,
  decorators: [
    withBookStub(),
    withCancelStub(),
    withConfirmStub(),
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
 * The grid highlights the time clicked. Picking a time in the search draws the visit it
 * would book as a draft, hatched and outlined, and searching another day takes it down.
 * Hovering open time marks nothing — a whole-column tint cannot say which time is under
 * the pointer. The calendar never moves itself to keep either in sight; page to a week
 * they are on and they are there.
 *
 * Clicking another time with the form part-filled keeps the answers and moves the time
 * search to the day clicked; a day the search already covers is left as it is.
 *
 * Clicking a booked appointment instead — the Tuesday and Wednesday imaging visits, or
 * anything booked from the form — opens its details in the same pane the booking form
 * uses, closing the form if one was open; clicking open time again puts the form back.
 * A form holding answers on either tab asks first, the way the configuration workspace
 * does; closing it with the ✕ does not.
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
 * Blocked time opens in that pane too: click Exam Room A's "Blocked" block on Thursday to
 * see whose time it holds, when, and why. "Edit" moves it or changes its notes, and
 * "Delete" takes it off the calendar.
 *
 * The imaging visits on Monday, Tuesday and Wednesday record **Uro Associates - Main Clinic**
 * as their site, so their details name it as the service facility. The telehealth visits
 * record none, and their details leave the line out.
 *
 * Eliana Garcia's Tuesday telehealth visit with Dr. Brown is the second of three, weekly, and is
 * marked as recurring; page a week back or forward for the first and third.
 *
 * Appointments are colored by visit type. Telehealth Consult names its color, grape, on its
 * HealthcareService; the others are given one picked from their reference.
 *
 * Monday morning's visits ended before the pinned "now" (12:05 that day), so they are drawn
 * faded: an imaging visit that was seen, and a telehealth visit the patient missed.
 *
 * Dr. Rivera also sees two imaging patients at the satellite: Theo Novak on Wednesday morning and
 * Priya Shah on Thursday afternoon. Choose **Uro Associates - Main Clinic**, the only site Dr.
 * Rivera's role names, and they go. Then focus on Dr. Rivera's calendar from its row: the satellite
 * visits come back muted, named by their visit type and site, beside the visits at the main clinic,
 * so the open time left is really open. Hover one for its patient.
 *
 * Everything here is kept on your own clock, so no time names a zone and nothing is
 * said under the calendar. `From A Different Timezone` is the same clinic scheduled
 * somewhere else, without Dr. Rivera's satellite visits.
 *
 * Set **appointmentCommentMaxLength** under Controls to cap the notes: the booking form and the
 * details' "Edit" count them against it and take no more. At 50, Tuesday's imaging visit has
 * notes within the cap, and Thursday's infusion has notes already past it, which have to be
 * shortened before its details can be saved.
 *
 * @param args - The props set from the Controls panel.
 * @returns The story.
 */
export const Basic = (args: WorkspaceProps): JSX.Element => <Workspace {...args} />;
Basic.decorators = [withFixtures([...LOCAL_FIXTURES, ...RIVERA_SATELLITE_VISITS])];
Basic.argTypes = {
  appointmentCommentMaxLength: { control: { type: 'number', min: 1 } },
};
// The workspace's other props are inferred from it too, but this story passes none of them on.
Basic.parameters = { controls: { include: ['appointmentCommentMaxLength'] } };

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
 * **Date & time** starts out on the time clicked to open the form, unless that time has
 * passed or a whole day was picked in month view.
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

/**
 * The workspace as a host opens it on one site, such as the facility a user launched
 * scheduling from.
 *
 * The host passes a reference to the Location, and the Service facility filter starts on **Uro Associates
 * - Satellite**: only the calendars held there are listed, only the appointments recording the
 * satellite are drawn, such as Dr. Brown's telehealth visit with Priya Shah on Thursday, and the
 * visit types on offer are the ones the satellite holds. Click open time and the booking form starts on the
 * satellite too, which is the site the booked appointment records.
 *
 * It is only where the filter starts. Take the pill off and every calendar and appointment comes
 * back.
 *
 * @returns The story.
 */
export const AtASite = (): JSX.Element => (
  <Workspace defaultServiceFacility={{ reference: 'Location/satellite-clinic' }} />
);
AtASite.decorators = [withFixtures(LOCAL_FIXTURES)];

interface WorkspaceProps {
  readonly canBypassSchedulingRules?: boolean;
  readonly defaultServiceFacility?: SchedulingWorkspaceProps['defaultServiceFacility'];
  readonly appointmentCommentMaxLength?: number;
}

/**
 * Fills the viewport under the package banner, which is 72px.
 * @param props - Whether the story lets a time be typed, the site it starts on, and the cap on notes.
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
        defaultServiceFacility={props.defaultServiceFacility}
        appointmentCommentMaxLength={props.appointmentCommentMaxLength}
        procedureBinding={PROCEDURE_VALUE_SET}
        diagnosisBinding={DIAGNOSIS_VALUE_SET}
        onBooked={({ appointments }) => {
          // A series reports every occurrence, in the order they fall.
          const [first] = appointments;
          const series = appointments.length > 1;
          showNotification({
            color: 'green',
            icon: <IconCalendarCheck size={18} />,
            title: series ? `${appointments.length} appointments booked` : 'Appointment booked',
            message: series ? `${describeBooking(first)} · weekly` : describeBooking(first),
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
        onRescheduled={({ appointments: [appointment] }) => {
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
