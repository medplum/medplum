// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/*
 * Fixtures for the availability shading stories: four providers across two service facilities, each with
 * recurring hours by visit type, and a week of appointments. All of it is made up.
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
  Resource,
  Schedule,
  Slot,
} from '@medplum/fhirtypes';
import { AVAILABILITY_SERVICE_FACILITY_URL } from '../availabilityShading';

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

function facility(id: string, name: string): WithId<Location> {
  return { resourceType: 'Location', id: `shading-${id}`, name };
}

export const riverside = facility('riverside', 'Riverside Clinic');
export const northgate = facility('northgate', 'Northgate Hospital');
export const SHADING_FACILITIES = [riverside, northgate];

// Every visit type defaults to weekdays 9 to 5, which is what a calendar setting no hours of its own for
// it inherits.
function visitType(id: string, name: string, color: string): WithId<HealthcareService> {
  return {
    resourceType: 'HealthcareService',
    id: `shading-${id}`,
    name,
    availableTime: [{ daysOfWeek: [...WEEKDAYS], availableStartTime: '09:00:00', availableEndTime: '17:00:00' }],
    extension: [{ url: SchedulingColorURI, valueString: color }],
  };
}

export const newPatient = visitType('new-patient', 'New Patient', 'green');
export const followUp = visitType('follow-up', 'Follow-up', 'blue');
export const injections = visitType('injections', 'Injections', 'orange');
export const procedures = visitType('procedures', 'Procedures', 'violet');
// Shares New Patient's color, as visit types an admin groups together would.
export const consult = visitType('consult', 'Consult', 'green');
export const telehealth = visitType('telehealth', 'Telehealth', 'cyan');
export const labReview = visitType('lab-review', 'Lab Review', 'pink');
export const SHADING_VISIT_TYPES = [newPatient, followUp, injections, procedures, consult, telehealth, labReview];

/** A provider's calendar, and the service facilities they work at. */
export interface ShadingProvider {
  readonly practitioner: WithId<Practitioner>;
  readonly schedule: WithId<Schedule>;
  /** Where the provider works. The workspace reads this from the provider's `PractitionerRole`s. */
  readonly facilities: readonly WithId<Location>[];
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
 * @param family - The provider's family name.
 * @param facilities - Where the provider works.
 * @param offers - The visit types the provider can be booked for.
 * @param hours - The recurring windows the provider sets, each at one service facility.
 * @returns The provider.
 */
function provider(
  family: string,
  facilities: readonly WithId<Location>[],
  offers: readonly WithId<HealthcareService>[],
  hours: readonly Hours[]
): ShadingProvider {
  const id = `shading-${family.toLowerCase()}`;
  const practitioner: WithId<Practitioner> = { resourceType: 'Practitioner', id, name: [{ prefix: ['Dr.'], family }] };
  let schedule: WithId<Schedule> = {
    resourceType: 'Schedule',
    id,
    actor: [createReference(practitioner)],
    serviceType: offers.flatMap(toServiceTypeCodeableConcepts),
  };
  for (const service of offers) {
    const windows = hours.filter(([hoursService]) => hoursService === service).map(availableTime);
    if (windows.length) {
      schedule = setScheduleSchedulingParameter(schedule, service, { url: 'availability', extension: windows });
    }
  }
  return { practitioner, schedule, facilities };
}

// New Patient in the morning and Follow-ups in the afternoon at the clinic; the hospital on the other days.
export const alvarez = provider(
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
export const bennett = provider(
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
export const chen = provider('Chen', [riverside], SHADING_VISIT_TYPES, [
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
  [telehealth, riverside, ['thu'], '13:00', '16:00'],
  [labReview, riverside, ['thu'], '13:00', '16:00'],
  [procedures, riverside, ['fri'], '08:00', '12:00'],
]);

// Sets no hours of their own, so every visit type they offer is at its default hours.
export const dalton = provider('Dalton', [riverside], [newPatient, followUp], []);

export const SHADING_PROVIDERS = [alvarez, bennett, chen, dalton];

const patients: WithId<Patient>[] = [];

function appointment(
  who: ShadingProvider,
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
    id: `shading-patient-${patients.length + 1}`,
    name: [{ given: [given], family }],
  };
  patients.push(patient);
  return {
    resourceType: 'Appointment',
    id: `shading-appointment-${patients.length}`,
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

export const SHADING_APPOINTMENTS = [
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
  appointment(chen, 'mon', '09:00', '09:30', injections, riverside, 'Hugo N.'),
  // Inside Monday's Injections window, so an Injections filter hides it and still has to leave its gap.
  appointment(chen, 'mon', '10:30', '11:30', procedures, riverside, 'Kate O.'),
  appointment(chen, 'tue', '09:00', '09:45', newPatient, riverside, 'Raj P.'),
  appointment(chen, 'tue', '14:00', '14:30', followUp, riverside, 'Mei Z.'),
  appointment(chen, 'wed', '09:30', '10:00', injections, riverside, 'Paul E.'),
  appointment(chen, 'thu', '10:00', '10:45', newPatient, riverside, 'Dana J.'),
  appointment(chen, 'thu', '13:30', '14:00', telehealth, riverside, 'Finn A.'),
  appointment(chen, 'fri', '08:00', '09:30', procedures, riverside, 'Lena Q.'),
  appointment(dalton, 'tue', '10:00', '10:45', newPatient, riverside, 'Noor I.'),
  appointment(dalton, 'thu', '14:00', '14:30', followUp, riverside, 'Greg U.'),
];

/** Blocked time: Bennett is off on Thursday afternoon. */
export const SHADING_SLOTS: WithId<Slot>[] = [
  {
    resourceType: 'Slot',
    id: 'shading-time-off',
    status: 'busy-unavailable',
    schedule: createReference(bennett.schedule),
    start: at('thu', '14:00'),
    end: at('thu', '16:00'),
    comment: 'Time off',
  },
];

/** What the stories' components read by reference, to store on the client before they render. */
export const SHADING_FIXTURES: readonly Resource[] = [
  ...SHADING_FACILITIES,
  ...SHADING_VISIT_TYPES,
  ...SHADING_PROVIDERS.flatMap(({ practitioner, schedule }) => [practitioner, schedule]),
  ...patients,
];
