// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SchedulingRequirement, WithId } from '@medplum/core';
import {
  CPT,
  createReference,
  deepClone,
  HL7_V2_0203,
  REQUIRES_DIAGNOSIS_CODE,
  SCHEDULING_ELIGIBILITY_SYSTEM,
  SCHEDULING_REQUIREMENT_CODES,
  SchedulingParametersURI,
  ServiceTypeReferenceURI,
  setScheduleParameter,
  SNOMED,
  TimezoneExtensionURI,
} from '@medplum/core';
import type {
  Appointment,
  AppointmentParticipant,
  Bundle,
  CodeableConcept,
  Coding,
  Device,
  Extension,
  HealthcareService,
  Identifier,
  Location,
  Patient,
  Practitioner,
  PractitionerRole,
  Resource,
  Schedule,
  Slot,
} from '@medplum/fhirtypes';
import { getBrowserTimezone } from '../AppointmentFinder/AppointmentFinder.times';

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
 * Declares a fixture a room or a bed.
 *
 * Leave the clinics without one: the element is optional, and a Location omitting it
 * must still be offered as a site.
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
  /** What booking it is blocked on, recorded as eligibility codes. */
  readonly requirements?: readonly SchedulingRequirement[];
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
    ...(options.requirements?.length && {
      eligibility: options.requirements.map((code) => ({
        code: { coding: [{ system: SCHEDULING_ELIGIBILITY_SYSTEM, code }] },
      })),
    }),
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
 * A visit type naming no location: offered at every site, kept across every site change.
 * Its name has to sort between the sited ones — that is what makes the merged list's
 * order evidence of a sort rather than one search appended to the other.
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
  // The zone a calendar is drawn in is read off its actor, so the provider carries it too.
  extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/timezone', valueCode: 'America/New_York' }],
};

export const DrOkaforPractitioner: WithId<Practitioner> = {
  resourceType: 'Practitioner',
  id: 'dr-okafor',
  name: [{ given: ['Tunde'], family: 'Okafor', prefix: ['Dr.'] }],
  // Central, matching the override on his Schedule: a second zone for the notice to name.
  extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/timezone', valueCode: 'America/Chicago' }],
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
const INFUSION: ScheduledService = { id: 'infusion-therapy', name: 'Infusion Therapy' };

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

/*
 * Dr. Okafor keeps this calendar in Central time, overriding the Eastern zone the service
 * itself names. One calendar somewhere else is what the workspace's timezone notice is for,
 * so without it the fixtures could only ever show the notice to a reader outside Eastern.
 */
export const DrOkaforSchedule = setScheduleParameter(
  buildSchedule('schedule-dr-okafor', 'Practitioner/dr-okafor', 'Dr. Tunde Okafor'),
  UltrasoundImagingService,
  { url: 'timezone', valueCode: 'America/Chicago' }
) as WithId<Schedule>;
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

/** A project's own curated code value sets, which is what the code fields bind to. */
export const PROCEDURE_VALUE_SET = 'http://example.com/ValueSet/billable-procedures';
export const DIAGNOSIS_VALUE_SET = 'http://example.com/ValueSet/billable-diagnoses';

export const ProcedureCodes: Coding[] = [
  {
    system: CPT,
    code: '96365',
    display: 'Intravenous infusion, for therapy, prophylaxis, or diagnosis; initial, up to 1 hour',
  },
  {
    system: CPT,
    code: '96366',
    display: 'Intravenous infusion, for therapy, prophylaxis, or diagnosis; each additional hour',
  },
  { system: CPT, code: '96360', display: 'Intravenous infusion, hydration; initial, 31 minutes to 1 hour' },
  { system: CPT, code: '96361', display: 'Intravenous infusion, hydration; each additional hour' },
  {
    system: CPT,
    code: '96372',
    display: 'Therapeutic, prophylactic, or diagnostic injection; subcutaneous or intramuscular',
  },
  {
    system: CPT,
    code: '96374',
    display: 'Therapeutic, prophylactic, or diagnostic injection; intravenous push, single or initial substance',
  },
  {
    system: CPT,
    code: '96375',
    display: 'Therapeutic, prophylactic, or diagnostic injection; each additional sequential intravenous push',
  },
  {
    system: CPT,
    code: '96401',
    display: 'Chemotherapy administration, subcutaneous or intramuscular; non-hormonal anti-neoplastic',
  },
  {
    system: CPT,
    code: '96413',
    display: 'Chemotherapy administration, intravenous infusion technique; up to 1 hour, single or initial substance',
  },
  {
    system: CPT,
    code: '96415',
    display: 'Chemotherapy administration, intravenous infusion technique; each additional hour',
  },
  {
    system: CPT,
    code: '96417',
    display: 'Chemotherapy administration, intravenous infusion technique; each additional sequential infusion',
  },
  { system: CPT, code: '20605', display: 'Arthrocentesis, aspiration and/or injection, intermediate joint or bursa' },
  { system: CPT, code: '20610', display: 'Arthrocentesis, aspiration and/or injection, major joint or bursa' },
  { system: CPT, code: '11900', display: 'Injection, intralesional; up to and including 7 lesions' },
  { system: CPT, code: '36415', display: 'Collection of venous blood by venipuncture' },
];

// ICD-10-CM rather than ICD-10, which is what a US practice bills under: what the field records is
// whatever the value set said, so the two must be able to differ.
const ICD10CM = 'http://hl7.org/fhir/sid/icd-10-cm';

export const DiagnosisCodes: Coding[] = [
  { system: ICD10CM, code: 'D63.1', display: 'Anemia in chronic kidney disease' },
  { system: ICD10CM, code: 'E86.0', display: 'Dehydration' },
  { system: ICD10CM, code: 'D50.9', display: 'Iron deficiency anemia, unspecified' },
  { system: ICD10CM, code: 'D51.0', display: 'Vitamin B12 deficiency anemia due to intrinsic factor deficiency' },
  { system: ICD10CM, code: 'Z51.11', display: 'Encounter for antineoplastic chemotherapy' },
  { system: ICD10CM, code: 'N18.30', display: 'Chronic kidney disease, stage 3 unspecified' },
  { system: ICD10CM, code: 'E11.9', display: 'Type 2 diabetes mellitus without complications' },
  { system: ICD10CM, code: 'K50.90', display: "Crohn's disease, unspecified, without complications" },
  { system: ICD10CM, code: 'K51.90', display: 'Ulcerative colitis, unspecified, without complications' },
  { system: ICD10CM, code: 'M06.9', display: 'Rheumatoid arthritis, unspecified' },
  { system: ICD10CM, code: 'M17.11', display: 'Unilateral primary osteoarthritis, right knee' },
  { system: ICD10CM, code: 'G35', display: 'Multiple sclerosis' },
  { system: ICD10CM, code: 'L40.0', display: 'Psoriasis vulgaris' },
  { system: ICD10CM, code: 'J45.909', display: 'Unspecified asthma, uncomplicated' },
  { system: ICD10CM, code: 'D69.6', display: 'Thrombocytopenia, unspecified' },
];

/** Both value sets, for a test or story standing up a project that imported them. */
export const AuthorizationValueSets: Record<string, Coding[]> = {
  [PROCEDURE_VALUE_SET]: ProcedureCodes,
  [DIAGNOSIS_VALUE_SET]: DiagnosisCodes,
};

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

/**
 * A visit type the practice designated as needing prior authorization, which is what makes the
 * booking form ask for codes. Requires all three, since a practice billing for an injection needs
 * each.
 */
export const InfusionService = buildSchedulableService({
  id: 'infusion-therapy',
  name: 'Infusion Therapy',
  category: 'Treatment',
  durationMinutes: 60,
  alignmentMinutes: 30,
  locationIds: ['main-clinic'],
  requirements: SCHEDULING_REQUIREMENT_CODES,
});

/**
 * The same visit type asking for only a diagnosis code, which is what a practice configures when
 * the rest is already settled: a procedure code carried by the visit type itself, say.
 */
export const DiagnosisOnlyInfusionService: WithId<HealthcareService> = {
  ...InfusionService,
  eligibility: [{ code: { coding: [{ system: SCHEDULING_ELIGIBILITY_SYSTEM, code: REQUIRES_DIAGNOSIS_CODE }] } }],
};

export const DrChenInfusionSchedule = buildSchedule(
  'schedule-dr-chen-infusion',
  'Practitioner/dr-chen',
  'Dr. Wei Chen',
  INFUSION
);

/** The designated visit type and somewhere to book it, on top of {@link SurgicalFixtures}. */
export const AuthorizationFixtures = [InfusionService, DrChenInfusionSchedule];

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

/**
 * Moves a set of fixtures onto the viewer's own clock.
 *
 * The fixtures are kept in Eastern and Central time, so anything rendered from them is
 * read from somewhere else — times labelled with their zone, and the calendar's notice
 * naming the clock it is drawn on. This is for showing the other case, where there is
 * nothing to disambiguate and none of that appears.
 *
 * @param resources - The fixtures to move. Cloned rather than changed.
 * @returns The same fixtures, with every zone they declare replaced by the viewer's.
 */
export function inViewerTimezone(resources: readonly Resource[]): Resource[] {
  const timezone = getBrowserTimezone();
  return resources.map((resource) => {
    const clone = deepClone(resource);
    if ('extension' in clone) {
      setTimezones(clone.extension, timezone);
    }
    return clone;
  });
}

/**
 * Rewrites every extension naming a timezone, at whatever depth it sits: an actor
 * declares its zone at the top level, while a service or a schedule declares one inside
 * its `SchedulingParameters`.
 *
 * @param extensions - The extensions to walk, changed in place.
 * @param timezone - The zone to write.
 */
function setTimezones(extensions: Extension[] | undefined, timezone: string): void {
  for (const extension of extensions ?? []) {
    if (extension.url === TimezoneExtensionURI || extension.url === 'timezone') {
      extension.valueCode = timezone;
    }
    setTimezones(extension.extension, timezone);
  }
}

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
 * A provider whose only role names the clinic's second floor rather than the clinic,
 * so a provider field booking at the clinic leaves them out while Exam Room B, on
 * that same floor, is offered.
 *
 * Kept out of `SchedulingFixtures` so it does not change the option counts the actor
 * and schedule tests assert on.
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

/** A project's own medical record number system, for identifiers carrying no type. */
export const MRN_SYSTEM = 'http://example.org/mrn';

// Patients for the field that has to tell one from another. Two of them share a
// name, which is the case the option row exists to answer: a name alone cannot
// separate them, so the row carries a birth date and a medical record number.
// One has none on file, and must still be listed rather than hidden.
function buildPatient(id: string, given: string, family: string, birthDate: string, mrn?: Identifier): WithId<Patient> {
  return {
    resourceType: 'Patient',
    id,
    name: [{ given: [given], family }],
    birthDate,
    identifier: mrn ? [mrn] : undefined,
  };
}

/** Typed as a medical record number, which is how it is read without configuration. */
export const ElderJordanPatient = buildPatient('jordan-elder', 'Jordan', 'Reyes', '1961-04-02', {
  type: { coding: [{ system: HL7_V2_0203, code: 'MR' }] },
  value: 'MRN-0041',
});

/** Same name, different person, and no medical record number on file. */
export const YoungerJordanPatient = buildPatient('jordan-younger', 'Jordan', 'Reyes', '1994-11-30');

/** Identified only by the system that issued it, which is what `mrnSystem` names. */
export const UntypedMrnPatient = buildPatient('sam-whitfield', 'Sam', 'Whitfield', '1978-06-14', {
  system: MRN_SYSTEM,
  value: 'MRN-0099',
});

export const PatientFixtures = [ElderJordanPatient, YoungerJordanPatient, UntypedMrnPatient];

/**
 * Appointments and Slots for the calendar view, dated within the week of Monday,
 * May 4 2020 — the date `MockDateWrapper` freezes the clock to, so `timeGridWeek`
 * always renders Sun May 3 through Sat May 9.
 */

/**
 * A same-day imaging visit needing the provider, the device, and the room together.
 *
 * Carries a `Patient` participant even though nothing here books against one: the
 * calendar titles an appointment event with the patient's name, so without one it
 * would just read "No Patient".
 */
export const RiveraImagingAppointment: WithId<Appointment> = {
  resourceType: 'Appointment',
  id: 'appt-rivera-imaging-tue',
  status: 'booked',
  start: '2020-05-05T17:00:00Z',
  end: '2020-05-05T17:30:00Z',
  participant: [
    { status: 'accepted', actor: { reference: 'Patient/pt-cooper', display: 'Miles Cooper' } },
    { status: 'accepted', actor: createReference(DrRiveraPractitioner) },
    { status: 'accepted', actor: createReference(Ultrasound1Device) },
    { status: 'accepted', actor: createReference(ExamRoomA) },
  ],
};

export const OkaforImagingAppointment: WithId<Appointment> = {
  resourceType: 'Appointment',
  id: 'appt-okafor-imaging-wed',
  status: 'booked',
  start: '2020-05-06T18:00:00Z',
  end: '2020-05-06T18:30:00Z',
  participant: [
    { status: 'accepted', actor: { reference: 'Patient/pt-alvarez', display: 'Renee Alvarez' } },
    { status: 'accepted', actor: createReference(DrOkaforPractitioner) },
    { status: 'accepted', actor: createReference(Ultrasound2Device) },
    { status: 'accepted', actor: createReference(ExamRoomB) },
  ],
};

/** Open availability outside the booked visits, on the pinned "today." */
export const RiveraFreeSlot: WithId<Slot> = {
  resourceType: 'Slot',
  id: 'slot-rivera-free-mon',
  status: 'free',
  start: '2020-05-04T14:00:00Z',
  end: '2020-05-04T16:00:00Z',
  schedule: createReference(DrRiveraSchedule),
  comment: 'Open for same-day imaging consults',
};

/** Blocked time, shown distinctly from a booked appointment. */
export const ExamRoomABlockedSlot: WithId<Slot> = {
  resourceType: 'Slot',
  id: 'slot-exam-room-a-blocked-thu',
  status: 'busy-unavailable',
  start: '2020-05-07T15:00:00Z',
  end: '2020-05-07T17:00:00Z',
  schedule: createReference(ExamRoomASchedule),
  comment: 'Equipment maintenance',
};

/** Availability at the satellite site, for when the location filter is switched. */
export const SatelliteRoomFreeSlot: WithId<Slot> = {
  resourceType: 'Slot',
  id: 'slot-satellite-room-free-fri',
  status: 'free',
  start: '2020-05-08T13:00:00Z',
  end: '2020-05-08T15:00:00Z',
  schedule: createReference(SatelliteRoomSchedule),
};

export const CalendarWeekFixtures = [
  RiveraImagingAppointment,
  OkaforImagingAppointment,
  RiveraFreeSlot,
  ExamRoomABlockedSlot,
  SatelliteRoomFreeSlot,
];
