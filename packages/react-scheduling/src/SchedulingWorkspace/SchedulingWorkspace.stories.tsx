// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MantineColorsTuple, MantineThemeOverride } from '@mantine/core';
import { MantineProvider, useMantineColorScheme, useMantineTheme } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import {
  createReference,
  RecurrenceIdExtensionURI,
  RecurringAppointmentSeriesIdentifierSystem,
  SchedulingScheduleColorURI,
  toServiceTypeCodeableConcepts,
} from '@medplum/core';
import type {
  Appointment,
  AppointmentParticipant,
  Device,
  Extension,
  HealthcareService,
  Location,
  Practitioner,
  Reference,
  Resource,
  Schedule,
  Slot,
} from '@medplum/fhirtypes';
import type { Meta } from '@storybook/react';
import { IconCalendarCancel, IconCalendarCheck, IconCalendarEvent } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { useMemo } from 'react';
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
  buildSchedulableService,
  CalendarWeekFixtures,
  DIAGNOSIS_VALUE_SET,
  ImagingBenchFixtures,
  inViewerTimezone,
  PatientFixtures,
  PROCEDURE_VALUE_SET,
  SchedulingFixtures,
} from '../stories/scheduling';
import colorStatesClasses from './ColorAndStates.module.css';
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

/**
 * The workspace as a host opens it on one site, such as the facility a user launched
 * scheduling from.
 *
 * The host passes a reference to the Location, and the Location filter starts on **Uro Associates
 * - Satellite**: only the calendars held there are listed, and the visit types on offer
 * are the ones the satellite holds. Click open time and the booking form starts on the
 * satellite too, which is the site the booked appointment records.
 *
 * It is only where the filter starts. Take the pill off and every calendar comes back.
 *
 * @returns The story.
 */
export const AtASite = (): JSX.Element => <Workspace defaultLocation={{ reference: 'Location/satellite-clinic' }} />;
AtASite.decorators = [withFixtures(LOCAL_FIXTURES)];

const PALETTE = [
  '#477E76',
  '#009BAD',
  '#09DBFF',
  '#00B6E7',
  '#0076C1',
  '#4891E4',
  '#879DBF',
  '#B6BFED',
  '#6F6D99',
  '#8E74D1',
  '#BF89E4',
  '#E9A4FF',
  '#9C509D',
  '#D16DA4',
  '#CB99AF',
  '#BA4C66',
  '#FFABB2',
  '#AD8080',
  '#ED806D',
  '#B65B1B',
  '#FFB652',
  '#C7AA76',
  '#B69200',
  '#837400',
  '#92B649',
  '#7F9267',
  '#89DB89',
  '#1B8940',
  '#28B077',
  '#00CDB3',
] as const;

const PALETTE_COLORS: Record<string, MantineColorsTuple> = Object.fromEntries(
  PALETTE.map((hex, i) => [`palette${i}`, Array.from({ length: 10 }, () => hex) as unknown as MantineColorsTuple])
);

function colorExtension(index: number): Extension {
  return { url: SchedulingScheduleColorURI, valueString: `palette${index}` };
}

const PROVIDER_NAMES: readonly (readonly [string, string])[] = [
  ['Maya', 'Rivera'],
  ['Tunde', 'Okafor'],
  ['Maria', 'Martinez'],
  ['Wei', 'Chen'],
  ['James', 'Kim'],
  ['Ama', 'Osei'],
  ['Lena', 'Novak'],
  ['Omar', 'Haddad'],
  ['Priya', 'Nair'],
  ['Sofia', 'Costa'],
];
const ROOM_NAMES = [
  'Exam Room 1',
  'Exam Room 2',
  'Exam Room 3',
  'Procedure Room A',
  'Procedure Room B',
  'Infusion Bay 1',
  'Infusion Bay 2',
  'Consult Room 1',
  'Consult Room 2',
  'Recovery Room',
];
const DEVICE_NAMES = [
  'Ultrasound 1',
  'Ultrasound 2',
  'X-Ray 1',
  'CT Scanner 1',
  'MRI 1',
  'EKG Cart 1',
  'Portable US 1',
  'Doppler 1',
  'C-Arm 1',
  'Bone Densitometer',
];
const SERVICE_TYPES = [
  'New Patient Visit',
  'Follow-up',
  'Annual Physical',
  'Ultrasound',
  'Lab Draw',
  'Imaging Consult',
  'Infusion',
  'Telehealth Check-in',
  'Procedure',
  'Wellness Check',
];
const serviceResources: WithId<HealthcareService>[] = SERVICE_TYPES.map((name, i) => ({
  resourceType: 'HealthcareService',
  id: `gen-service-${i}`,
  active: true,
  name,
}));

const PATIENT_NAMES = [
  'Miles Cooper',
  'Renee Alvarez',
  'Jordan Reyes',
  'Sam Whitfield',
  'Ada Fletcher',
  'Leo Marsh',
  'Nina Bauer',
  'Theo Park',
];

const providerResources: WithId<Practitioner>[] = PROVIDER_NAMES.map(([given, family], i) => ({
  resourceType: 'Practitioner',
  id: `gen-prov-${i}`,
  active: true,
  name: [{ given: [given], family, prefix: ['Dr.'] }],
}));
const roomResources: WithId<Location>[] = ROOM_NAMES.map((name, i) => ({
  resourceType: 'Location',
  id: `gen-room-${i}`,
  status: 'active',
  name,
  physicalType: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/location-physical-type', code: 'ro' }] },
}));
const deviceResources: WithId<Device>[] = DEVICE_NAMES.map((name, i) => ({
  resourceType: 'Device',
  id: `gen-device-${i}`,
  status: 'active',
  deviceName: [{ name, type: 'user-friendly-name' }],
}));

function paletteSchedule(
  idSuffix: string,
  actorReference: string,
  actorDisplay: string,
  colorIndex: number
): WithId<Schedule> {
  return {
    resourceType: 'Schedule',
    id: `gen-sched-${idSuffix}`,
    active: true,
    actor: [{ reference: actorReference, display: actorDisplay }],
    extension: [colorExtension(colorIndex)],
  };
}

const providerSchedules = providerResources.map((provider, i) =>
  paletteSchedule(`prov-${i}`, `Practitioner/${provider.id}`, `Dr. ${PROVIDER_NAMES[i][0]} ${PROVIDER_NAMES[i][1]}`, i)
);
const roomSchedules = roomResources.map((room, i) =>
  paletteSchedule(`room-${i}`, `Location/${room.id}`, ROOM_NAMES[i], 10 + i)
);
const deviceSchedules = deviceResources.map((device, i) =>
  paletteSchedule(`device-${i}`, `Device/${device.id}`, DEVICE_NAMES[i], 20 + i)
);

const WEEK_DAYS = [3, 4, 5, 6, 7, 8, 9];
const VISITS_PER_DAY = 12;
const START_MINUTES = [0, 5, 10, 15, 20, 30, 40, 45, 50];
const DURATION_CHOICES = [20, 20, 30, 30, 30, 45, 60, 90];

function localIso(day: number, hour: number, minute: number): string {
  return new Date(2020, 4, day, hour, minute, 0, 0).toISOString();
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildWeekAppointments(): WithId<Appointment>[] {
  const random = mulberry32(20200504);
  const pick = <T,>(choices: readonly T[]): T => choices[Math.floor(random() * choices.length)];
  const out: WithId<Appointment>[] = [];
  WEEK_DAYS.forEach((day, dayIndex) => {
    for (let slotIndex = 0; slotIndex < VISITS_PER_DAY; slotIndex++) {
      const n = dayIndex * VISITS_PER_DAY + slotIndex;
      const start = localIso(day, 7 + Math.floor(random() * 10), pick(START_MINUTES));
      const end = new Date(new Date(start).getTime() + pick(DURATION_CHOICES) * 60_000).toISOString();
      const participant: AppointmentParticipant[] = [
        {
          status: 'accepted',
          actor: { reference: `Patient/gen-pt-${n}`, display: PATIENT_NAMES[n % PATIENT_NAMES.length] },
        },
        { status: 'accepted', actor: createReference(providerResources[n % providerResources.length]) },
      ];
      if (slotIndex % 3 === 0) {
        participant.push({
          status: 'accepted',
          actor: createReference(roomResources[(dayIndex + slotIndex) % roomResources.length]),
        });
        participant.push({
          status: 'accepted',
          actor: createReference(deviceResources[(dayIndex * 2 + slotIndex) % deviceResources.length]),
        });
      }
      out.push({
        resourceType: 'Appointment',
        id: `gen-appt-${day}-${slotIndex}`,
        status: 'booked',
        serviceType: toServiceTypeCodeableConcepts(serviceResources[(n * 7) % serviceResources.length]),
        start,
        end,
        participant,
      });
    }
  });
  return out;
}

const appointmentResources: WithId<Appointment>[] = buildWeekAppointments();

const PALETTE_FIXTURES: Resource[] = [
  ...serviceResources,
  ...providerResources,
  ...providerSchedules,
  ...roomResources,
  ...roomSchedules,
  ...deviceResources,
  ...deviceSchedules,
  ...appointmentResources,
];

const GRAY_CALENDAR_FIXTURES: Resource[] = [
  ...serviceResources,
  ...providerResources,
  ...[...providerSchedules, ...roomSchedules, ...deviceSchedules].map((schedule) => ({
    ...schedule,
    extension: [{ url: SchedulingScheduleColorURI, valueString: 'gray' }],
  })),
  ...roomResources,
  ...deviceResources,
  ...appointmentResources,
];

function WithPaletteColors({ children }: { children: ReactNode }): JSX.Element {
  const base = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();
  const theme = useMemo(
    (): MantineThemeOverride => ({ ...base, colors: { ...base.colors, ...PALETTE_COLORS } }),
    [base]
  );
  return (
    <MantineProvider theme={theme} forceColorScheme={colorScheme === 'dark' ? 'dark' : 'light'}>
      {children}
    </MantineProvider>
  );
}

export const ManyColorCodedCalendars = (): JSX.Element => (
  <WithPaletteColors>
    <Workspace />
  </WithPaletteColors>
);
ManyColorCodedCalendars.decorators = [withFixtures(PALETTE_FIXTURES)];

export const ColoredAppointmentBlocks = (): JSX.Element => (
  <WithPaletteColors>
    <Workspace />
  </WithPaletteColors>
);
ColoredAppointmentBlocks.decorators = [withFixtures(GRAY_CALENDAR_FIXTURES)];

const COLOR_STATES_VISIT_TYPES = [
  ['New Patient Visit', 'indigo', '#364fc7'],
  ['Follow-up', 'violet', '#5f3dc4'],
  ['Annual Physical', 'grape', '#862e9c'],
  ['Vaccination', 'pink', '#a61e4d'],
  ['Urgent Visit', 'red', '#bc2727'],
  ['Lab Draw', 'orange', '#b33a0a'],
  ['Wellness Check', 'yellow', '#884e00'],
  ['Nutrition Consult', 'lime', '#477408'],
  ['Physical Therapy', 'green', '#237433'],
  ['Infusion', 'teal', '#077452'],
  ['Telehealth Check-in', 'cyan', '#0a6e81'],
  ['Ultrasound', 'blue', '#1863a9'],
] as const;

function WithVisitTypeTones({ children }: { children: ReactNode }): JSX.Element {
  const base = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();
  const theme = useMemo(
    (): MantineThemeOverride => ({
      ...base,
      colors: {
        ...base.colors,
        ...Object.fromEntries(
          COLOR_STATES_VISIT_TYPES.map(([, color, tone]) => [
            color,
            base.colors[color].map((shade, i) => (i === 9 ? tone : shade)) as unknown as MantineColorsTuple,
          ])
        ),
      },
    }),
    [base]
  );
  return (
    <MantineProvider theme={theme} forceColorScheme={colorScheme === 'dark' ? 'dark' : 'light'}>
      {children}
    </MantineProvider>
  );
}

const colorStatesServices: WithId<HealthcareService>[] = COLOR_STATES_VISIT_TYPES.map(([name]) =>
  buildSchedulableService({
    id: `color-states-${name.toLowerCase().replace(/[^a-z]+/g, '-')}`,
    name,
    category: 'Office visit',
    durationMinutes: 30,
    alignmentMinutes: 15,
  })
);

const COLOR_STATES_COLORS = new Map<string, string>(
  colorStatesServices.map((service, i) => [`HealthcareService/${service.id}`, COLOR_STATES_VISIT_TYPES[i][1]])
);

function colorStatesServiceColor(serviceReference: string): string | undefined {
  return COLOR_STATES_COLORS.get(serviceReference);
}

function colorStatesOfferings(schedule: Schedule, index: number): number[] {
  const actor = schedule.actor[0]?.reference ?? '';
  if (actor.startsWith('Practitioner/')) {
    return [0, 1, 2, 3].map((k) => (index * 3 + k) % COLOR_STATES_VISIT_TYPES.length);
  }
  if (actor.startsWith('Device/')) {
    return [5, 9, 11];
  }
  return [0, 1, 2, 3, 4, 6, 7];
}

const colorStatesClinic: Resource[] = LOCAL_FIXTURES.filter(
  (resource) =>
    resource.resourceType !== 'HealthcareService' &&
    resource.resourceType !== 'Appointment' &&
    !(resource.resourceType === 'Slot' && (resource.status === 'busy' || resource.status === 'free'))
).map((resource, _, all) =>
  resource.resourceType === 'Schedule'
    ? {
        ...resource,
        serviceType: colorStatesOfferings(
          resource,
          all
            .filter((other): other is WithId<Schedule> => other.resourceType === 'Schedule')
            .filter((other) => other.actor[0]?.reference?.split('/')[0] === resource.actor[0]?.reference?.split('/')[0])
            .findIndex((other) => other.id === resource.id)
        ).flatMap((i) => toServiceTypeCodeableConcepts(colorStatesServices[i])),
        extension: [
          ...(resource.extension ?? []).filter((extension) => extension.url !== SchedulingScheduleColorURI),
          { url: SchedulingScheduleColorURI, valueString: 'gray' },
        ],
      }
    : resource
);

const COLOR_STATES_VISITS_PER_DAY = 10;

const COLOR_STATES_RECURRING = new Map<number, number>([
  [2, 3],
  [17, 1],
  [28, 6],
  [44, 4],
  [45, 2],
]);

const COLOR_STATES_STATUSES = new Map<number, Appointment['status']>([
  [6, 'pending'],
  [23, 'pending'],
  [37, 'pending'],
  [14, 'cancelled'],
  [44, 'cancelled'],
]);

function buildColorStatesAppointments(): WithId<Appointment>[] {
  const providers = colorStatesClinic
    .filter((resource): resource is WithId<Schedule> => resource.resourceType === 'Schedule')
    .filter((schedule) => schedule.actor[0]?.reference?.startsWith('Practitioner/'))
    .map((schedule, index) => ({ actor: schedule.actor[0], offers: colorStatesOfferings(schedule, index) }));
  const blocked = colorStatesClinic
    .filter((resource): resource is WithId<Slot> => resource.resourceType === 'Slot')
    .filter((slot) => slot.status === 'busy-unavailable')
    .map((slot) => [Date.parse(slot.start), Date.parse(slot.end)] as const);
  const random = mulberry32(20200508);
  const pick = <T,>(choices: readonly T[]): T => choices[Math.floor(random() * choices.length)];
  const out: WithId<Appointment>[] = [];
  [4, 5, 6, 7, 8].forEach((day, dayIndex) => {
    for (let slotIndex = 0; slotIndex < COLOR_STATES_VISITS_PER_DAY; slotIndex++) {
      const n = dayIndex * COLOR_STATES_VISITS_PER_DAY + slotIndex;
      const provider = providers[n % providers.length];
      const status = COLOR_STATES_STATUSES.get(n) ?? 'booked';
      let start: string;
      let end: string;
      do {
        start = localIso(day, 7 + Math.floor(random() * 10), pick(START_MINUTES));
        const minutes = Math.max(pick(DURATION_CHOICES), status === 'booked' ? 0 : 45);
        end = new Date(Date.parse(start) + minutes * 60_000).toISOString();
      } while (blocked.some(([from, to]) => Date.parse(start) < to && Date.parse(end) > from));
      const series = COLOR_STATES_RECURRING.get(n);
      out.push({
        resourceType: 'Appointment',
        id: `color-states-appt-${day}-${slotIndex}`,
        ...(series && {
          identifier: [{ system: RecurringAppointmentSeriesIdentifierSystem, value: `color-states-series-${n}` }],
          extension: [{ url: RecurrenceIdExtensionURI, valuePositiveInt: series }],
        }),
        status,
        serviceType: toServiceTypeCodeableConcepts(
          colorStatesServices[provider.offers[Math.floor(n / providers.length) % provider.offers.length]]
        ),
        start,
        end,
        participant: [
          {
            status: 'accepted',
            actor: createReference(AppointmentPatientFixtures[n % AppointmentPatientFixtures.length]),
          },
          { status: 'accepted', actor: provider.actor },
        ],
      });
    }
  });
  return withColorStatesProgress(out);
}

const COLOR_STATES_NOW = Date.parse(localIso(4, 12, 5));

function withColorStatesProgress(appointments: WithId<Appointment>[]): WithId<Appointment>[] {
  const progressed = appointments.map((appointment): WithId<Appointment> => {
    if (appointment.status !== 'booked') {
      return appointment;
    }
    if (Date.parse(appointment.end as string) <= COLOR_STATES_NOW) {
      return { ...appointment, status: 'fulfilled' };
    }
    if (Date.parse(appointment.start as string) <= COLOR_STATES_NOW) {
      return { ...appointment, status: 'arrived' };
    }
    return appointment;
  });
  const next = progressed
    .filter((appointment) => appointment.status === 'booked')
    .sort((a, b) => Date.parse(a.start as string) - Date.parse(b.start as string))[0];
  return progressed.map((appointment) =>
    appointment === next ? { ...appointment, status: 'checked-in' } : appointment
  );
}

const COLOR_STATES_FIXTURES: Resource[] = [
  ...colorStatesClinic,
  ...colorStatesServices,
  ...buildColorStatesAppointments(),
];

export const ColorAndStates = (): JSX.Element => (
  <WithVisitTypeTones>
    <div className={colorStatesClasses.colorStates}>
      <Workspace serviceTypeColor={colorStatesServiceColor} showCancelled />
    </div>
  </WithVisitTypeTones>
);
ColorAndStates.storyName = 'TEMP: Colors & States + Locations/Visit Type Filters';
ColorAndStates.decorators = [withFixtures(COLOR_STATES_FIXTURES)];

interface WorkspaceProps {
  readonly serviceTypeColor?: (serviceReference: string) => string | undefined;
  readonly showCancelled?: boolean;
  readonly canBypassSchedulingRules?: boolean;
  readonly defaultLocation?: Reference<Location>;
}

/**
 * Fills the viewport under the package banner, which is 72px.
 * @param props - Whether the story lets a time be typed, and the site it starts on.
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
        serviceTypeColor={props.serviceTypeColor}
        showCancelled={props.showCancelled}
        defaultLocation={props.defaultLocation}
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
