// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/*
 * Fixtures for showing availability shading in the scheduling workspace: four providers across two service
 * facilities, each with recurring hours by visit type, and a week of appointments. All of it is made up.
 *
 * The week is the one `withMockedDate` freezes the clock in, so the calendar opens on it.
 */
import type { WithId } from '@medplum/core';
import {
  createReference,
  SchedulingColorURI,
  setScheduleSchedulingParameter,
  toAppointmentSiteReference,
  toServiceTypeCodeableConcepts,
} from '@medplum/core';
import type {
  Appointment,
  Extension,
  HealthcareService,
  Location,
  Patient,
  Practitioner,
  PractitionerRole,
  Resource,
  Schedule,
  Slot,
} from '@medplum/fhirtypes';
import { AVAILABILITY_SERVICE_FACILITY_URL } from '../availabilityShading';
import { buildSchedulableService } from './scheduling';

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri'] as const;
type Weekday = (typeof WEEKDAYS)[number];

/**
 * A time in the week on show, in the viewer's zone.
 * @param day - The weekday.
 * @param time - The time of day, as `HH:MM`.
 * @returns The instant.
 */
function at(day: Weekday, time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  // Monday, 4 May 2020.
  return new Date(2020, 4, 4 + WEEKDAYS.indexOf(day), hours, minutes).toISOString();
}

const riverside: WithId<Location> = { resourceType: 'Location', id: 'riverside-clinic', name: 'Riverside Clinic' };
const northgate: WithId<Location> = { resourceType: 'Location', id: 'northgate-hospital', name: 'Northgate Hospital' };

// Every visit type is held at both facilities and defaults to weekdays 9 to 5, which is what a calendar
// setting no hours of its own for it inherits.
function visitType(id: string, name: string, color: string): WithId<HealthcareService> {
  const service = buildSchedulableService({
    id,
    name,
    category: 'Office visit',
    durationMinutes: 30,
    alignmentMinutes: 15,
    locationIds: [riverside.id, northgate.id],
  });
  return {
    ...service,
    availableTime: [{ daysOfWeek: [...WEEKDAYS], availableStartTime: '09:00:00', availableEndTime: '17:00:00' }],
    extension: [...(service.extension ?? []), { url: SchedulingColorURI, valueString: color }],
  };
}

const newPatient = visitType('new-patient', 'New Patient', 'green');
const followUp = visitType('follow-up', 'Follow-up', 'blue');
const injections = visitType('injections', 'Injections', 'orange');
const procedures = visitType('procedures', 'Procedures', 'violet');
// Shares New Patient's color, as visit types an admin groups together would.
const consult = visitType('consult', 'Consult', 'green');
const woundCare = visitType('wound-care', 'Wound Care', 'cyan');
const labReview = visitType('lab-review', 'Lab Review', 'pink');
const VISIT_TYPES = [newPatient, followUp, injections, procedures, consult, woundCare, labReview];

interface Provider {
  readonly practitioner: WithId<Practitioner>;
  readonly schedule: WithId<Schedule>;
  /** Names where the provider works, which is what the Service facility filter lists calendars by. */
  readonly role: WithId<PractitionerRole>;
}

type Hours = readonly [
  service: WithId<HealthcareService>,
  facility: WithId<Location>,
  days: readonly Weekday[],
  start: string,
  end: string,
];

function availableTime([, site, days, start, end]: Hours): Extension {
  return {
    url: 'availableTime',
    extension: [
      ...days.map((day) => ({ url: 'daysOfWeek', valueCode: day })),
      { url: 'availableStartTime', valueTime: `${start}:00` },
      { url: 'availableEndTime', valueTime: `${end}:00` },
      { url: AVAILABILITY_SERVICE_FACILITY_URL, valueReference: createReference(site) },
    ],
  };
}

/**
 * Builds a provider whose Schedule offers some visit types and sets its own hours for the ones `hours`
 * names. The rest it offers at their default hours.
 * @param given - The provider's given name.
 * @param family - The provider's family name.
 * @param facilities - Where the provider works.
 * @param offers - The visit types the provider can be booked for.
 * @param hours - The recurring windows the provider sets, each at one service facility.
 * @returns The provider.
 */
function provider(
  given: string,
  family: string,
  facilities: readonly WithId<Location>[],
  offers: readonly WithId<HealthcareService>[],
  hours: readonly Hours[]
): Provider {
  const id = `dr-${family.toLowerCase()}`;
  const practitioner: WithId<Practitioner> = {
    resourceType: 'Practitioner',
    id,
    name: [{ prefix: ['Dr.'], given: [given], family }],
  };
  const role: WithId<PractitionerRole> = {
    resourceType: 'PractitionerRole',
    id: `role-${id}`,
    practitioner: createReference(practitioner),
    location: facilities.map(createReference),
  };
  let schedule: WithId<Schedule> = {
    resourceType: 'Schedule',
    id: `schedule-${id}`,
    active: true,
    actor: [createReference(practitioner)],
    serviceType: offers.flatMap(toServiceTypeCodeableConcepts),
  };
  for (const service of offers) {
    const windows = hours.filter(([hoursService]) => hoursService === service).map(availableTime);
    if (windows.length) {
      schedule = setScheduleSchedulingParameter(schedule, service, { url: 'availability', extension: windows });
    }
  }
  return { practitioner, schedule, role };
}

// New Patient in the morning and Follow-ups in the afternoon at the clinic; the hospital on the other days.
const alvarez = provider(
  'Sofia',
  'Alvarez',
  [riverside, northgate],
  [newPatient, followUp, procedures, injections],
  [
    [newPatient, riverside, ['mon', 'wed', 'fri'], '09:00', '12:00'],
    [followUp, riverside, ['mon', 'wed', 'fri'], '12:00', '16:00'],
    [procedures, northgate, ['tue', 'thu'], '08:00', '12:00'],
    [injections, northgate, ['tue', 'thu'], '13:00', '15:00'],
  ]
);

// The other half of Alvarez's New Patient day, so that together they cover 9 to 4.
const bennett = provider(
  'Marcus',
  'Bennett',
  [riverside],
  [newPatient, followUp, injections],
  [
    [followUp, riverside, ['mon', 'tue', 'wed', 'thu'], '09:00', '12:00'],
    [newPatient, riverside, ['mon', 'tue', 'wed', 'thu'], '12:00', '16:00'],
    [injections, riverside, ['fri'], '09:00', '13:00'],
  ]
);

// Overlapping windows: two colors on Monday, three on Wednesday, five on Thursday afternoon, and two
// visit types of one color on Tuesday morning.
const castillo = provider('Irene', 'Castillo', [riverside], VISIT_TYPES, [
  [injections, riverside, ['mon'], '09:00', '12:00'],
  [procedures, riverside, ['mon'], '10:00', '14:00'],
  [newPatient, riverside, ['tue'], '09:00', '11:00'],
  [consult, riverside, ['tue'], '10:00', '12:30'],
  [followUp, riverside, ['tue'], '13:00', '16:00'],
  [injections, riverside, ['wed'], '09:00', '12:00'],
  [procedures, riverside, ['wed'], '09:00', '12:00'],
  [followUp, riverside, ['wed'], '09:00', '12:00'],
  [newPatient, riverside, ['wed'], '13:00', '16:00'],
  [newPatient, riverside, ['thu'], '09:00', '12:00'],
  [followUp, riverside, ['thu'], '13:00', '16:00'],
  [injections, riverside, ['thu'], '13:00', '16:00'],
  [procedures, riverside, ['thu'], '13:00', '16:00'],
  [woundCare, riverside, ['thu'], '13:00', '16:00'],
  [labReview, riverside, ['thu'], '13:00', '16:00'],
  [procedures, riverside, ['fri'], '08:00', '12:00'],
]);

// Sets no hours of their own, so every visit type they offer is at its default hours.
const dalton = provider('Ryan', 'Dalton', [riverside], [newPatient, followUp], []);

const PROVIDERS = [alvarez, bennett, castillo, dalton];

const patients: WithId<Patient>[] = [];

function appointment(
  who: Provider,
  day: Weekday,
  start: string,
  end: string,
  service: WithId<HealthcareService>,
  site: WithId<Location>,
  patientName: string
): WithId<Appointment> {
  const [given, family] = patientName.split(' ');
  const patient: WithId<Patient> = {
    resourceType: 'Patient',
    id: `availability-patient-${patients.length + 1}`,
    name: [{ given: [given], family }],
  };
  patients.push(patient);
  return {
    resourceType: 'Appointment',
    id: `availability-appointment-${patients.length}`,
    status: 'booked',
    start: at(day, start),
    end: at(day, end),
    serviceType: toServiceTypeCodeableConcepts(service),
    participant: [
      { actor: createReference(who.practitioner), status: 'accepted' },
      { actor: createReference(patient), status: 'accepted' },
    ],
    supportingInformation: [toAppointmentSiteReference(site)],
  };
}

const APPOINTMENTS = [
  appointment(alvarez, 'mon', '09:00', '09:45', newPatient, riverside, 'Maria G.'),
  appointment(alvarez, 'mon', '13:00', '13:30', followUp, riverside, 'Tom H.'),
  appointment(alvarez, 'tue', '08:30', '10:00', procedures, northgate, 'Priya S.'),
  appointment(alvarez, 'wed', '10:00', '10:45', newPatient, riverside, 'Luis R.'),
  appointment(alvarez, 'wed', '14:00', '14:30', followUp, riverside, 'Anna K.'),
  appointment(alvarez, 'thu', '09:00', '10:30', procedures, northgate, 'Derek M.'),
  appointment(alvarez, 'thu', '13:00', '13:30', injections, northgate, 'Joan P.'),
  appointment(alvarez, 'fri', '09:30', '10:15', newPatient, riverside, 'Sam W.'),
  appointment(alvarez, 'fri', '12:30', '13:00', followUp, riverside, 'Nia B.'),
  appointment(bennett, 'mon', '09:30', '10:00', followUp, riverside, 'Carl D.'),
  appointment(bennett, 'mon', '13:00', '13:45', newPatient, riverside, 'Elena V.'),
  appointment(bennett, 'tue', '12:00', '12:45', newPatient, riverside, 'Omar F.'),
  appointment(bennett, 'wed', '10:30', '11:00', followUp, riverside, 'Ruth C.'),
  appointment(bennett, 'wed', '14:00', '14:45', newPatient, riverside, 'Ben T.'),
  appointment(bennett, 'fri', '10:00', '10:30', injections, riverside, 'Ivy L.'),
  appointment(castillo, 'mon', '09:00', '09:30', injections, riverside, 'Hugo N.'),
  // Inside Monday's Injections window, so an Injections filter hides it and still has to leave its gap.
  appointment(castillo, 'mon', '10:30', '11:30', procedures, riverside, 'Kate O.'),
  appointment(castillo, 'tue', '09:00', '09:45', newPatient, riverside, 'Raj P.'),
  appointment(castillo, 'tue', '14:00', '14:30', followUp, riverside, 'Mei Z.'),
  appointment(castillo, 'wed', '09:30', '10:00', injections, riverside, 'Paul E.'),
  appointment(castillo, 'thu', '10:00', '10:45', newPatient, riverside, 'Dana J.'),
  appointment(castillo, 'thu', '13:30', '14:00', woundCare, riverside, 'Finn A.'),
  appointment(castillo, 'fri', '08:00', '09:30', procedures, riverside, 'Lena Q.'),
  appointment(dalton, 'tue', '10:00', '10:45', newPatient, riverside, 'Noor I.'),
  appointment(dalton, 'thu', '14:00', '14:30', followUp, riverside, 'Greg U.'),
];

// Blocked time: Bennett is off on Thursday afternoon.
const SLOTS: WithId<Slot>[] = [
  {
    resourceType: 'Slot',
    id: 'availability-time-off',
    status: 'busy-unavailable',
    schedule: createReference(bennett.schedule),
    start: at('thu', '14:00'),
    end: at('thu', '16:00'),
    comment: 'Time off',
  },
];

export const AvailabilityShadingFixtures: readonly Resource[] = [
  riverside,
  northgate,
  ...VISIT_TYPES,
  ...PROVIDERS.flatMap(({ practitioner, schedule, role }) => [practitioner, schedule, role]),
  ...patients,
  ...APPOINTMENTS,
  ...SLOTS,
];
