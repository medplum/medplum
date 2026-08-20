// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { SchedulingParametersURI, ServiceTypeReferenceURI, SNOMED } from '@medplum/core';
import type {
  Appointment,
  AppointmentParticipant,
  Bundle,
  CodeableConcept,
  Device,
  HealthcareService,
  Location,
  Practitioner,
  PractitionerRole,
  Schedule,
} from '@medplum/fhirtypes';

/** Who an appointment can be held on, as FHIR allows. */
type ParticipantActor = NonNullable<AppointmentParticipant['actor']>;

/**
 * Fixtures for the scheduling components: one imaging service bookable against
 * two providers, two rooms, and two devices, across two sites.
 *
 * Shaped after the canonical seed bundle in the Defining Availability guide: the
 * service carries the `SchedulingParameters`, and each Schedule links back to it
 * through the `service-type-reference` extension on its `serviceType`.
 */

export const APPOINTMENT_TYPE_SYSTEM = 'http://example.org/appointment-types';

/**
 * What a Location says it physically is, which is how the site field tells a site
 * from a room. The clinics below deliberately say nothing: nothing requires the
 * element, and a Location that omits it is still offered as a site.
 *
 * @param code - The `location-physical-type` code the Location declares.
 * @returns The concept to record it as.
 */
function physicalType(code: 'ro' | 'bd'): CodeableConcept {
  return { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/location-physical-type', code }] };
}

export const MainClinic: WithId<Location> = {
  resourceType: 'Location',
  id: 'main-clinic',
  name: 'Uro Associates - Main Clinic',
  extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/timezone', valueCode: 'America/New_York' }],
};

/** A room directly inside the clinic. */
export const ExamRoomA: WithId<Location> = {
  resourceType: 'Location',
  id: 'exam-room-a',
  name: 'Exam Room A',
  physicalType: physicalType('ro'),
  partOf: { reference: 'Location/main-clinic' },
};

/** A bed in that room: the other thing a site is never one of. */
export const ExamRoomABed: WithId<Location> = {
  resourceType: 'Location',
  id: 'exam-room-a-bed-1',
  name: 'Exam Room A Bed 1',
  physicalType: physicalType('bd'),
  partOf: { reference: 'Location/exam-room-a' },
};

export const SecondFloor: WithId<Location> = {
  resourceType: 'Location',
  id: 'second-floor',
  name: 'Second Floor',
  partOf: { reference: 'Location/main-clinic' },
};

/** A room at the clinic, but a floor below it rather than directly inside. */
export const ExamRoomB: WithId<Location> = {
  resourceType: 'Location',
  id: 'exam-room-b',
  name: 'Exam Room B',
  physicalType: physicalType('ro'),
  partOf: { reference: 'Location/second-floor' },
};

export const SatelliteClinic: WithId<Location> = {
  resourceType: 'Location',
  id: 'satellite-clinic',
  name: 'Uro Associates - Satellite',
};

/** A room at the other site, which the main clinic must never offer. */
export const SatelliteRoom: WithId<Location> = {
  resourceType: 'Location',
  id: 'satellite-room',
  name: 'Satellite Exam Room',
  physicalType: physicalType('ro'),
  partOf: { reference: 'Location/satellite-clinic' },
};

export interface SchedulableServiceOptions {
  readonly id: string;
  readonly name: string;
  /** What the visit is, which is the line the pick list shows under the name. */
  readonly category: string;
  readonly durationMinutes: number;
  readonly alignmentMinutes: number;
  /** The sites holding it, omitted entirely by a visit type held nowhere in particular. */
  readonly locationIds?: readonly string[];
}

/**
 * Builds a service `$find` can produce times for: typed, optionally sited, and
 * carrying the `SchedulingParameters` a booking needs.
 * @param options - What the visit is, how long it runs, and where it is held.
 * @returns The service.
 */
export function buildSchedulableService(options: SchedulableServiceOptions): WithId<HealthcareService> {
  const locationIds = options.locationIds ?? [];
  return {
    resourceType: 'HealthcareService',
    id: options.id,
    name: options.name,
    ...(locationIds.length > 0 && {
      location: locationIds.map((locationId) => ({ reference: `Location/${locationId}` })),
    }),
    type: [{ coding: [{ system: APPOINTMENT_TYPE_SYSTEM, code: options.id }], text: options.category }],
    extension: [
      {
        url: SchedulingParametersURI,
        extension: [
          { url: 'duration', valueDuration: { value: options.durationMinutes, unit: 'min' } },
          { url: 'alignmentInterval', valueDuration: { value: options.alignmentMinutes, unit: 'min' } },
          { url: 'timezone', valueCode: 'America/New_York' },
        ],
      },
    ],
  };
}

export const UltrasoundImagingService = buildSchedulableService({
  id: 'ultrasound-imaging',
  name: 'Ultrasound Imaging',
  category: 'Imaging',
  durationMinutes: 30,
  alignmentMinutes: 15,
  locationIds: ['main-clinic'],
});

/**
 * A visit type held nowhere in particular.
 *
 * It names no location, so a reference search on `location` matches it against no
 * site — which is why choosing a site stops it being offered, while a site change
 * cannot invalidate an answer that was never tied to one.
 */
export const TelehealthService = buildSchedulableService({
  id: 'telehealth-consult',
  name: 'Telehealth Consult',
  category: 'Telehealth',
  durationMinutes: 20,
  alignmentMinutes: 20,
});

/** A service with no SchedulingParameters, which must never be offered. */
export const WalkInService: WithId<HealthcareService> = {
  resourceType: 'HealthcareService',
  id: 'walk-in',
  name: 'Walk-in Clinic',
  location: [{ reference: 'Location/main-clinic' }],
  type: [{ coding: [{ system: APPOINTMENT_TYPE_SYSTEM, code: 'walk-in' }], text: 'Walk-in' }],
};

export const DrRiveraPractitioner: WithId<Practitioner> = {
  resourceType: 'Practitioner',
  id: 'dr-rivera',
  name: [{ given: ['Maya'], family: 'Rivera', prefix: ['Dr.'] }],
};

export const DrOkaforPractitioner: WithId<Practitioner> = {
  resourceType: 'Practitioner',
  id: 'dr-okafor',
  name: [{ given: ['Tunde'], family: 'Okafor', prefix: ['Dr.'] }],
};

export const Ultrasound1Device: WithId<Device> = {
  resourceType: 'Device',
  id: 'ultrasound-1',
  deviceName: [{ name: 'Ultrasound 1 (Main Campus)', type: 'user-friendly-name' }],
};

export const Ultrasound2Device: WithId<Device> = {
  resourceType: 'Device',
  id: 'ultrasound-2',
  deviceName: [{ name: 'Ultrasound 2 (Main Campus)', type: 'user-friendly-name' }],
};

interface ScheduledService {
  readonly id: string;
  readonly name: string;
}

const IMAGING: ScheduledService = { id: 'ultrasound-imaging', name: 'Ultrasound Imaging' };
const SURGERY: ScheduledService = { id: 'bariatric-surgery', name: 'Bariatric Surgery' };

function buildSchedule(
  id: string,
  actorReference: string,
  actorDisplay: string,
  service: ScheduledService = IMAGING
): WithId<Schedule> {
  return {
    resourceType: 'Schedule',
    id,
    active: true,
    comment: `${actorDisplay} - ${service.name} availability`,
    actor: [{ reference: actorReference, display: actorDisplay }],
    serviceType: [
      {
        coding: [{ system: APPOINTMENT_TYPE_SYSTEM, code: service.id }],
        extension: [{ url: ServiceTypeReferenceURI, valueReference: { reference: `HealthcareService/${service.id}` } }],
      },
    ],
  };
}

export const DrRiveraSchedule = buildSchedule('schedule-dr-rivera', 'Practitioner/dr-rivera', 'Dr. Maya Rivera');
export const DrOkaforSchedule = buildSchedule('schedule-dr-okafor', 'Practitioner/dr-okafor', 'Dr. Tunde Okafor');
export const Ultrasound1Schedule = buildSchedule(
  'schedule-ultrasound-1',
  'Device/ultrasound-1',
  'Ultrasound 1 (Main Campus)'
);
export const Ultrasound2Schedule = buildSchedule(
  'schedule-ultrasound-2',
  'Device/ultrasound-2',
  'Ultrasound 2 (Main Campus)'
);
export const ExamRoomASchedule = buildSchedule('schedule-exam-room-a', 'Location/exam-room-a', 'Exam Room A');
export const ExamRoomBSchedule = buildSchedule('schedule-exam-room-b', 'Location/exam-room-b', 'Exam Room B');
export const SatelliteRoomSchedule = buildSchedule(
  'schedule-satellite-room',
  'Location/satellite-room',
  'Satellite Exam Room'
);

/**
 * A second service, for the harder case: one booking that needs a surgeon, an
 * anesthesiologist and a room, all free at once.
 *
 * Its providers hold both a Practitioner and a PractitionerRole, split the way
 * scheduling reads them: the schedule is held on the Practitioner, so one human
 * has one calendar, while the role carries the specialty and the site that decide
 * whether that human is eligible at all.
 */
const PRACTITIONER_ROLE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/practitioner-role';

export const SurgeryService = buildSchedulableService({
  id: 'bariatric-surgery',
  name: 'Bariatric Surgery',
  category: 'Surgery',
  durationMinutes: 120,
  alignmentMinutes: 30,
  locationIds: ['main-clinic'],
});

export const OperatingRoom3: WithId<Location> = {
  resourceType: 'Location',
  id: 'or-3',
  name: 'Operating Room 3',
  type: [
    { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode', code: 'OR' }], text: 'Operating room' },
  ],
  partOf: { reference: 'Location/main-clinic' },
};

function buildSurgicalPractitioner(id: string, given: string, family: string): WithId<Practitioner> {
  return { resourceType: 'Practitioner', id, name: [{ given: [given], family, prefix: ['Dr.'] }] };
}

export const DrMartinezPractitioner = buildSurgicalPractitioner('dr-martinez', 'Maria', 'Martinez');
export const DrChenPractitioner = buildSurgicalPractitioner('dr-chen', 'Wei', 'Chen');
export const DrKimPractitioner = buildSurgicalPractitioner('dr-kim', 'James', 'Kim');

function buildSurgicalRole(
  id: string,
  practitioner: string,
  specialty: { code: string; display: string }
): WithId<PractitionerRole> {
  return {
    resourceType: 'PractitionerRole',
    id,
    practitioner: { reference: `Practitioner/${practitioner}` },
    healthcareService: [{ reference: 'HealthcareService/bariatric-surgery' }],
    location: [{ reference: 'Location/main-clinic' }],
    code: [{ coding: [{ system: PRACTITIONER_ROLE_SYSTEM, code: 'doctor', display: 'Doctor' }] }],
    specialty: [{ coding: [{ system: SNOMED, ...specialty }] }],
  };
}

const SURGEON = { code: '394609007', display: 'Surgery' };
const ANESTHESIA = { code: '394577000', display: 'Anaesthetics' };

export const DrMartinezRole = buildSurgicalRole('role-dr-martinez', 'dr-martinez', SURGEON);
export const DrChenRole = buildSurgicalRole('role-dr-chen', 'dr-chen', SURGEON);
export const DrKimRole = buildSurgicalRole('role-dr-kim', 'dr-kim', ANESTHESIA);

export const DrMartinezSchedule = buildSchedule(
  'schedule-dr-martinez',
  'Practitioner/dr-martinez',
  'Dr. Maria Martinez',
  SURGERY
);
export const DrChenSchedule = buildSchedule('schedule-dr-chen', 'Practitioner/dr-chen', 'Dr. Wei Chen', SURGERY);
export const DrKimSchedule = buildSchedule('schedule-dr-kim', 'Practitioner/dr-kim', 'Dr. James Kim', SURGERY);
export const OperatingRoom3Schedule = buildSchedule('schedule-or-3', 'Location/or-3', 'Operating Room 3', SURGERY);

export const SurgicalFixtures = [
  SurgeryService,
  OperatingRoom3,
  DrMartinezPractitioner,
  DrChenPractitioner,
  DrKimPractitioner,
  DrMartinezRole,
  DrChenRole,
  DrKimRole,
  DrMartinezSchedule,
  DrChenSchedule,
  DrKimSchedule,
  OperatingRoom3Schedule,
];

export const SchedulingFixtures = [
  MainClinic,
  ExamRoomA,
  ExamRoomABed,
  SecondFloor,
  ExamRoomB,
  SatelliteClinic,
  SatelliteRoom,
  UltrasoundImagingService,
  TelehealthService,
  WalkInService,
  DrRiveraPractitioner,
  DrOkaforPractitioner,
  Ultrasound1Device,
  Ultrasound2Device,
  DrRiveraSchedule,
  DrOkaforSchedule,
  Ultrasound1Schedule,
  Ultrasound2Schedule,
  ExamRoomASchedule,
  ExamRoomBSchedule,
  SatelliteRoomSchedule,
];

export interface ProposedAppointmentOptions {
  readonly start: string;
  readonly durationMinutes?: number;
  /** References of the schedules the appointment is held on. */
  readonly scheduleReferences?: readonly string[];
  /**
   * The actors participating, mirroring the schedules' actors. Given as bare
   * reference strings or as references carrying a display, since the server
   * copies a Schedule's actor across whole and a display is how the person is
   * named on screen.
   */
  readonly actorReferences?: readonly (string | ParticipantActor)[];
  /** The service it is proposed for. Defaults to the imaging service. */
  readonly serviceId?: string;
}

/**
 * Builds a proposed Appointment shaped like one from `Appointment/$find`,
 * including the `contained` Slots that `$book` and `$hold` require.
 *
 * @param options - Start time, length, and the schedules and actors involved.
 * @returns A proposed Appointment.
 */
export function buildProposedAppointment(options: ProposedAppointmentOptions): Appointment {
  const {
    start,
    durationMinutes = 30,
    scheduleReferences = ['Schedule/schedule-ultrasound-1'],
    actorReferences = ['Device/ultrasound-1'],
    serviceId = IMAGING.id,
  } = options;

  const end = new Date(new Date(start).getTime() + durationMinutes * 60 * 1000).toISOString();

  return {
    resourceType: 'Appointment',
    status: 'proposed',
    start,
    end,
    serviceType: [
      {
        coding: [{ system: APPOINTMENT_TYPE_SYSTEM, code: serviceId }],
        extension: [{ url: ServiceTypeReferenceURI, valueReference: { reference: `HealthcareService/${serviceId}` } }],
      },
    ],
    participant: actorReferences.map((actor) => ({
      actor: typeof actor === 'string' ? { reference: actor } : actor,
      required: 'required',
      status: 'needs-action',
    })),
    contained: scheduleReferences.map((reference) => ({
      resourceType: 'Slot',
      status: 'busy',
      start,
      end,
      schedule: { reference },
    })),
  };
}

/**
 * Wraps proposed appointments in the searchset Bundle that `$find` returns.
 * @param appointments - The proposed appointments.
 * @returns A searchset Bundle.
 */
export function buildFindBundle(appointments: readonly Appointment[]): Bundle<Appointment> {
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    entry: appointments.map((resource) => ({ resource })),
  };
}

/**
 * A provider whose only role names the clinic's second floor rather than the
 * clinic, which is what leaves her out of a provider field booking at the clinic
 * while Exam Room B, on that same floor, is offered.
 *
 * Exported separately from `SchedulingFixtures` so that adding her does not change
 * the option counts the actor and schedule tests assert on.
 */
export const DrOseiPractitioner: WithId<Practitioner> = {
  resourceType: 'Practitioner',
  id: 'dr-osei',
  name: [{ given: ['Ama'], family: 'Osei', prefix: ['Dr.'] }],
};

export const DrOseiRole: WithId<PractitionerRole> = {
  resourceType: 'PractitionerRole',
  id: 'role-dr-osei',
  practitioner: { reference: 'Practitioner/dr-osei' },
  healthcareService: [{ reference: 'HealthcareService/ultrasound-imaging' }],
  location: [{ reference: 'Location/second-floor' }],
};

export const DrOseiSchedule = buildSchedule('schedule-dr-osei', 'Practitioner/dr-osei', 'Dr. Ama Osei');

export const SubClinicProviderFixtures = [DrOseiPractitioner, DrOseiRole, DrOseiSchedule];
