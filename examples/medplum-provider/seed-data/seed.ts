// SPDX-License-Identifier: Apache-2.0
//
// Seed data for the multi-resource Find & Book scheduling demo.
//
// Two visit types:
//   - Cystoscopy (Urology Procedure): Practitioner + Room + Device, 30 min,
//     10/10 min buffer, 15 min alignment.
//   - Urology Consult (Follow-up): Practitioner + Room only (no Device),
//     20 min, 5/5 min buffer, 15 min alignment — exercises a visit type
//     with a different resource shape and different scheduling parameters
//     on the SAME providers/rooms (realistic: providers do both).
//
// Practice timezone: America/Los_Angeles (PST/PDT).
//
// Idempotent: safe to re-run against the same project (uses
// createResourceIfNoneExist keyed by identifier everywhere; the one
// exception, linking a second service onto an existing Schedule, checks
// for the existing link before updating).
//
// Usage (from examples/medplum-provider, with the local server running on
// http://localhost:8103):
//
//   MEDPLUM_BASE_URL=http://localhost:8103/ \
//   MEDPLUM_EMAIL=everett@scheduling-demo.local \
//   MEDPLUM_PASSWORD=medplum123 \
//   npx tsx seed-data/seed.ts
//
import { MedplumClient, createReference, getReferenceString } from '@medplum/core';
import type { WithId } from '@medplum/core';
import type {
  Appointment,
  Device,
  Extension,
  HealthcareService,
  Location,
  Patient,
  PlanDefinition,
  Practitioner,
  Reference,
  Schedule,
  Slot,
} from '@medplum/fhirtypes';

const IDENTIFIER_SYSTEM = 'https://medplum.com/fhir/candid-scheduling-demo';
const SchedulingParametersURI = 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters';
const ServiceTypeReferenceURI = 'https://medplum.com/fhir/service-type-reference';
const SchedulingEncounterCodingURI = 'https://medplum.com/fhir/StructureDefinition/SchedulingEncounterCoding';
const SchedulingPlanDefinitionURI = 'https://medplum.com/fhir/StructureDefinition/SchedulingPlanDefinition';
const TimezoneExtensionURI = 'http://hl7.org/fhir/StructureDefinition/timezone';
const DEMO_TIMEZONE = 'America/Los_Angeles';
// Demo-only, illustrative extension: a plain "preferred provider" note on a
// Patient, used solely to bias the recommended-combo heuristic (spec §4.4).
// Not a real preference-learning system.
const PreferredProviderURI = 'https://medplum.com/fhir/StructureDefinition/candid-preferred-provider';

const BASE_URL = process.env.MEDPLUM_BASE_URL ?? 'http://localhost:8103/';
const EMAIL = process.env.MEDPLUM_EMAIL ?? 'everett@scheduling-demo.local';
const PASSWORD = process.env.MEDPLUM_PASSWORD ?? 'medplum123';

function weekdayAvailability(): Extension {
  return {
    url: 'availability',
    extension: [
      {
        url: 'availableTime',
        extension: [
          { url: 'daysOfWeek', valueCode: 'mon' },
          { url: 'daysOfWeek', valueCode: 'tue' },
          { url: 'daysOfWeek', valueCode: 'wed' },
          { url: 'daysOfWeek', valueCode: 'thu' },
          { url: 'daysOfWeek', valueCode: 'fri' },
          { url: 'availableStartTime', valueTime: '08:00:00' },
          { url: 'availableEndTime', valueTime: '17:00:00' },
        ],
      },
    ],
  } as unknown as Extension;
}

function toCodeableReferenceLike(service: WithId<HealthcareService>): HealthcareService['type'] {
  const extension = [{ url: ServiceTypeReferenceURI, valueReference: createReference(service) }];
  if (!service.type?.length) {
    return [{ extension }];
  }
  return service.type.map((concept) => ({ ...concept, extension: [...(concept.extension ?? []), ...extension] }));
}

// Returns the next `count` weekdays (Mon-Fri) starting at least `minDaysOut`
// days from now, at midnight local time. Always in the future, so re-running
// the seed script keeps producing occupancy that hasn't already passed.
function nextWeekdays(count: number, minDaysOut = 2): Date[] {
  const days: Date[] = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + minDaysOut);
  while (days.length < count) {
    if (d.getDay() !== 0 && d.getDay() !== 6) {
      days.push(new Date(d));
    }
    d.setDate(d.getDate() + 1);
  }
  return days;
}

// Deterministic pseudo-random in [0, 1) from an integer seed — NOT
// Math.random(): re-running the seed script must produce the exact same
// occupancy every time (createResourceIfNoneExist is keyed by identifiers
// derived from this same seed, so a different result each run would create
// duplicate, ever-accumulating bookings instead of staying idempotent).
function deterministicFraction(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

async function ensurePlanDefinition(medplum: MedplumClient, key: string, title: string): Promise<WithId<PlanDefinition>> {
  // Minimal PlanDefinition (no actions) — enough for $apply to no-op cleanly
  // while satisfying BookAppointmentForm.bookEncounter's requirement that the
  // HealthcareService point at *some* PlanDefinition to trigger Encounter
  // creation after booking (spec §4.5).
  return medplum.createResourceIfNoneExist<PlanDefinition>(
    {
      resourceType: 'PlanDefinition',
      identifier: [{ system: IDENTIFIER_SYSTEM, value: key }],
      title,
      status: 'active',
    },
    `identifier=${IDENTIFIER_SYSTEM}|${key}`
  );
}

async function ensureHealthcareService(
  medplum: MedplumClient,
  planDefinition: WithId<PlanDefinition>,
  opts: {
    key: string;
    name: string;
    durationMin: number;
    bufferBeforeMin: number;
    bufferAfterMin: number;
    alignmentIntervalMin: number;
  }
): Promise<WithId<HealthcareService>> {
  return medplum.createResourceIfNoneExist<HealthcareService>(
    {
      resourceType: 'HealthcareService',
      identifier: [{ system: IDENTIFIER_SYSTEM, value: opts.key }],
      active: true,
      name: opts.name,
      type: [{ coding: [{ code: opts.key }], text: opts.name }],
      extension: [
        {
          url: SchedulingParametersURI,
          extension: [
            { url: 'duration', valueDuration: { value: opts.durationMin, unit: 'min' } },
            { url: 'bufferBefore', valueDuration: { value: opts.bufferBeforeMin, unit: 'min' } },
            { url: 'bufferAfter', valueDuration: { value: opts.bufferAfterMin, unit: 'min' } },
            { url: 'alignmentInterval', valueDuration: { value: opts.alignmentIntervalMin, unit: 'min' } },
          ],
        },
        { url: SchedulingPlanDefinitionURI, valueReference: createReference(planDefinition) },
        {
          url: SchedulingEncounterCodingURI,
          valueCoding: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' },
        },
      ],
    },
    `identifier=${IDENTIFIER_SYSTEM}|${opts.key}`
  );
}

async function ensurePractitioner(
  medplum: MedplumClient,
  key: string,
  given: string,
  family: string
): Promise<WithId<Practitioner>> {
  return medplum.createResourceIfNoneExist<Practitioner>(
    {
      resourceType: 'Practitioner',
      identifier: [{ system: IDENTIFIER_SYSTEM, value: key }],
      name: [{ given: [given], family }],
      qualification: [{ code: { text: 'Urology' } }],
      extension: [{ url: TimezoneExtensionURI, valueCode: DEMO_TIMEZONE }],
    },
    `identifier=${IDENTIFIER_SYSTEM}|${key}`
  );
}

async function ensureFacility(medplum: MedplumClient): Promise<WithId<Location>> {
  return medplum.createResourceIfNoneExist<Location>(
    {
      resourceType: 'Location',
      identifier: [{ system: IDENTIFIER_SYSTEM, value: 'uro-associates-main-clinic' }],
      status: 'active',
      mode: 'instance',
      name: 'Uro Associates – Main Clinic',
    },
    `identifier=${IDENTIFIER_SYSTEM}|uro-associates-main-clinic`
  );
}

async function ensureRoom(
  medplum: MedplumClient,
  facility: WithId<Location>,
  key: string,
  name: string
): Promise<WithId<Location>> {
  return medplum.createResourceIfNoneExist<Location>(
    {
      resourceType: 'Location',
      identifier: [{ system: IDENTIFIER_SYSTEM, value: key }],
      status: 'active',
      mode: 'instance',
      name,
      partOf: createReference(facility),
      extension: [{ url: TimezoneExtensionURI, valueCode: DEMO_TIMEZONE }],
    },
    `identifier=${IDENTIFIER_SYSTEM}|${key}`
  );
}

async function ensureDevice(medplum: MedplumClient): Promise<WithId<Device>> {
  return medplum.createResourceIfNoneExist<Device>(
    {
      resourceType: 'Device',
      identifier: [{ system: IDENTIFIER_SYSTEM, value: 'cystoscopy-ultrasound-unit-1' }],
      status: 'active',
      deviceName: [{ name: 'Cystoscopy Ultrasound Unit 1', type: 'user-friendly-name' }],
      extension: [{ url: TimezoneExtensionURI, valueCode: DEMO_TIMEZONE }],
    },
    `identifier=${IDENTIFIER_SYSTEM}|cystoscopy-ultrasound-unit-1`
  );
}

async function ensureSchedule(
  medplum: MedplumClient,
  healthcareService: WithId<HealthcareService>,
  actorKey: string,
  actorRef: Reference
): Promise<WithId<Schedule>> {
  const actorRefStr = getReferenceString({ reference: actorRef.reference } as Reference);
  return medplum.createResourceIfNoneExist<Schedule>(
    {
      resourceType: 'Schedule',
      identifier: [{ system: IDENTIFIER_SYSTEM, value: `schedule-${actorKey}` }],
      active: true,
      actor: [actorRef],
      serviceType: toCodeableReferenceLike(healthcareService),
      extension: [
        {
          url: SchedulingParametersURI,
          extension: [{ url: 'service', valueReference: createReference(healthcareService) }, weekdayAvailability()],
        },
      ],
    },
    `actor=${actorRefStr}`
  );
}

// Idempotently links a second service onto an already-existing Schedule
// (used so the same practitioner/room Schedules serve both Cystoscopy and
// the Consult visit type, rather than seeding a wholly separate set of
// actors per service — realistic, since providers/rooms are shared across
// visit types in practice).
async function addServiceToSchedule(
  medplum: MedplumClient,
  schedule: WithId<Schedule>,
  service: WithId<HealthcareService>
): Promise<WithId<Schedule>> {
  const serviceRefStr = getReferenceString(service);
  const alreadyLinked = schedule.extension?.some(
    (ext) =>
      ext.url === SchedulingParametersURI &&
      ext.extension?.some((e) => e.url === 'service' && e.valueReference?.reference === serviceRefStr)
  );
  if (alreadyLinked) {
    return schedule;
  }

  const updated: Schedule = {
    ...schedule,
    serviceType: [...(schedule.serviceType ?? []), ...toCodeableReferenceLike(service)],
    extension: [
      ...(schedule.extension ?? []),
      {
        url: SchedulingParametersURI,
        extension: [{ url: 'service', valueReference: createReference(service) }, weekdayAvailability()],
      },
    ],
  };
  return medplum.updateResource(updated);
}

async function ensurePatient(
  medplum: MedplumClient,
  key: string,
  given: string,
  family: string,
  birthDate: string,
  gender: Patient['gender'],
  preferredProvider?: WithId<Practitioner>
): Promise<WithId<Patient>> {
  return medplum.createResourceIfNoneExist<Patient>(
    {
      resourceType: 'Patient',
      identifier: [{ system: IDENTIFIER_SYSTEM, value: key }],
      name: [{ given: [given], family }],
      birthDate,
      gender,
      ...(preferredProvider && {
        extension: [{ url: PreferredProviderURI, valueReference: createReference(preferredProvider) }],
      }),
    },
    `identifier=${IDENTIFIER_SYSTEM}|${key}`
  );
}

async function ensureBusyBooking(
  medplum: MedplumClient,
  key: string,
  schedule: WithId<Schedule>,
  actorRef: Reference,
  patient: WithId<Patient>,
  start: Date,
  end: Date,
  service: WithId<HealthcareService>
): Promise<void> {
  const slot = await medplum.createResourceIfNoneExist<Slot>(
    {
      resourceType: 'Slot',
      identifier: [{ system: IDENTIFIER_SYSTEM, value: `slot-${key}` }],
      schedule: createReference(schedule),
      status: 'busy',
      start: start.toISOString(),
      end: end.toISOString(),
    },
    `identifier=${IDENTIFIER_SYSTEM}|slot-${key}`
  );

  await medplum.createResourceIfNoneExist<Appointment>(
    {
      resourceType: 'Appointment',
      identifier: [{ system: IDENTIFIER_SYSTEM, value: `appointment-${key}` }],
      status: 'booked',
      // serviceType lets the Calendar screen's Reschedule action resolve the
      // originating visit type and pre-fill Find & Book (Calendar spec §4.6).
      // Appointments created via $book get this automatically; seeded ones
      // must set it explicitly or reschedule opens Find & Book blank.
      serviceType: toCodeableReferenceLike(service),
      slot: [createReference(slot)],
      start: start.toISOString(),
      end: end.toISOString(),
      participant: [
        { actor: actorRef, status: 'accepted' },
        { actor: createReference(patient), status: 'accepted' },
      ],
    },
    `identifier=${IDENTIFIER_SYSTEM}|appointment-${key}`
  );
}

// An unconfirmed ("pending") booking — created via the same `$hold` shape
// $find/$book use (`status: 'pending'` Appointment + `busy-tentative` Slot),
// seeded directly rather than through the operation for idempotency. Without
// these, the Calendar screen's striped/unconfirmed color-coding and the
// session-details panel's Confirm ($confirm) action have nothing real to act
// on — $book (Find & Book's only booking call) always produces `booked`
// appointments (Calendar & Availability spec §4.5, §8).
async function ensurePendingBooking(
  medplum: MedplumClient,
  key: string,
  schedule: WithId<Schedule>,
  actorRef: Reference,
  patient: WithId<Patient>,
  start: Date,
  end: Date,
  service: WithId<HealthcareService>
): Promise<void> {
  const slot = await medplum.createResourceIfNoneExist<Slot>(
    {
      resourceType: 'Slot',
      identifier: [{ system: IDENTIFIER_SYSTEM, value: `slot-${key}` }],
      schedule: createReference(schedule),
      status: 'busy-tentative',
      start: start.toISOString(),
      end: end.toISOString(),
    },
    `identifier=${IDENTIFIER_SYSTEM}|slot-${key}`
  );

  await medplum.createResourceIfNoneExist<Appointment>(
    {
      resourceType: 'Appointment',
      identifier: [{ system: IDENTIFIER_SYSTEM, value: `appointment-${key}` }],
      status: 'pending',
      serviceType: toCodeableReferenceLike(service),
      slot: [createReference(slot)],
      start: start.toISOString(),
      end: end.toISOString(),
      participant: [
        { actor: actorRef, status: 'tentative' },
        { actor: createReference(patient), status: 'tentative' },
      ],
    },
    `identifier=${IDENTIFIER_SYSTEM}|appointment-${key}`
  );
}

// A "hold" — provider out of office, room blocked for maintenance, device
// offline for calibration — is operationally distinct from a patient
// booking: it's a Slot only, no Appointment, no patient participant. Still
// blocks $find the same way (busy-unavailable is treated the same as busy).
async function ensureHold(
  medplum: MedplumClient,
  key: string,
  schedule: WithId<Schedule>,
  start: Date,
  end: Date
): Promise<void> {
  await medplum.createResourceIfNoneExist<Slot>(
    {
      resourceType: 'Slot',
      identifier: [{ system: IDENTIFIER_SYSTEM, value: `slot-${key}` }],
      schedule: createReference(schedule),
      status: 'busy-unavailable',
      start: start.toISOString(),
      end: end.toISOString(),
    },
    `identifier=${IDENTIFIER_SYSTEM}|slot-${key}`
  );
}

async function main(): Promise<void> {
  const medplum = new MedplumClient({ baseUrl: BASE_URL, fetch: fetch.bind(globalThis) });
  const loginResp = await medplum.startLogin({ email: EMAIL, password: PASSWORD });
  await medplum.processCode(loginResp.code);
  console.log(`Logged in as ${EMAIL}`);

  const cystoscopyPlan = await ensurePlanDefinition(medplum, 'cystoscopy-visit-plan', 'Cystoscopy Visit');
  const cystoscopy = await ensureHealthcareService(medplum, cystoscopyPlan, {
    key: 'cystoscopy-urology-procedure',
    name: 'Cystoscopy (Urology Procedure)',
    durationMin: 30,
    bufferBeforeMin: 10,
    bufferAfterMin: 10,
    alignmentIntervalMin: 15,
  });
  console.log(`HealthcareService: ${getReferenceString(cystoscopy)}`);

  const consultPlan = await ensurePlanDefinition(medplum, 'consult-visit-plan', 'Urology Consult Visit');
  const consult = await ensureHealthcareService(medplum, consultPlan, {
    key: 'urology-consult-followup',
    name: 'Urology Consult (Follow-up)',
    durationMin: 20,
    bufferBeforeMin: 5,
    bufferAfterMin: 5,
    alignmentIntervalMin: 15,
  });
  console.log(`HealthcareService: ${getReferenceString(consult)} (Practitioner + Room only, no Device)`);

  const chen = await ensurePractitioner(medplum, 'practitioner-chen', 'Alicia', 'Chen');
  const reyes = await ensurePractitioner(medplum, 'practitioner-reyes', 'Marcus', 'Reyes');

  const facility = await ensureFacility(medplum);
  const roomA = await ensureRoom(medplum, facility, 'procedure-room-a', 'Procedure Room A');
  const roomB = await ensureRoom(medplum, facility, 'procedure-room-b', 'Procedure Room B');

  const device = await ensureDevice(medplum);

  const chenSchedule = await ensureSchedule(medplum, cystoscopy, 'practitioner-chen', createReference(chen));
  const reyesSchedule = await ensureSchedule(medplum, cystoscopy, 'practitioner-reyes', createReference(reyes));
  const roomASchedule = await ensureSchedule(medplum, cystoscopy, 'procedure-room-a', createReference(roomA));
  const roomBSchedule = await ensureSchedule(medplum, cystoscopy, 'procedure-room-b', createReference(roomB));
  const deviceSchedule = await ensureSchedule(medplum, cystoscopy, 'cystoscopy-ultrasound-unit-1', createReference(device));

  // Consult reuses the same providers/rooms (no Device) — different
  // duration/buffer come from `consult`'s own SchedulingParameters.
  await addServiceToSchedule(medplum, chenSchedule, consult);
  await addServiceToSchedule(medplum, reyesSchedule, consult);
  await addServiceToSchedule(medplum, roomASchedule, consult);
  await addServiceToSchedule(medplum, roomBSchedule, consult);

  console.log('Schedules: 2 practitioners, 2 rooms, 1 device — practitioners/rooms serve both visit types');

  const patients = [
    await ensurePatient(medplum, 'patient-1', 'Jane', 'Doe', '1975-03-14', 'female', chen),
    await ensurePatient(medplum, 'patient-2', 'Robert', 'Kim', '1968-11-02', 'male', reyes),
    await ensurePatient(medplum, 'patient-3', 'Maria', 'Gonzalez', '1982-06-21', 'female'),
    await ensurePatient(medplum, 'patient-4', 'David', 'Okafor', '1959-01-09', 'male'),
    await ensurePatient(medplum, 'patient-5', 'Susan', 'Whitfield', '1990-09-30', 'female'),
  ];
  console.log(`Patients created: ${patients.length} (2 with a seeded preferred-provider note)`);

  // Dense, deterministic occupancy across both providers, both rooms, and
  // the device over the next two weeks (10 business days) — a real busy
  // urology clinic, not "everyone always free." Each actor's 8am-5pm day is
  // split into six 90-minute quarters; a deterministic hash of
  // (actor, day, quarter) decides whether that quarter is booked, and if so
  // books the first 60 minutes of it (leaving a 30 min gap so $find still
  // has room to work with). Dr. Chen is seeded busier than Dr. Reyes so the
  // load-balancing half of the Recommended heuristic has real signal.
  const QUARTER_MINUTES = 90;
  const QUARTERS_PER_DAY = 6; // 8:00-17:00
  const BOOKING_MINUTES = 60;

  type OccupancyActor = {
    key: string;
    schedule: WithId<Schedule>;
    actorRef: Reference;
    seed: number; // higher seed -> busier (see deterministicFraction threshold below)
    busyThreshold: number; // fraction of quarters booked, e.g. 0.65 = ~65%
  };

  const occupancyActors: OccupancyActor[] = [
    { key: 'chen', schedule: chenSchedule, actorRef: createReference(chen), seed: 11, busyThreshold: 0.7 },
    { key: 'reyes', schedule: reyesSchedule, actorRef: createReference(reyes), seed: 23, busyThreshold: 0.5 },
    { key: 'rooma', schedule: roomASchedule, actorRef: createReference(roomA), seed: 37, busyThreshold: 0.6 },
    { key: 'roomb', schedule: roomBSchedule, actorRef: createReference(roomB), seed: 47, busyThreshold: 0.6 },
    { key: 'device', schedule: deviceSchedule, actorRef: createReference(device), seed: 59, busyThreshold: 0.65 },
  ];

  // minDaysOut=1: start occupancy tomorrow, not "2 business days out" — the
  // whole point is that it's visible immediately, not just once you page
  // the date range forward.
  const businessDays = nextWeekdays(10, 1);
  let bookingCount = 0;

  for (const actor of occupancyActors) {
    for (const [dayIndex, day] of businessDays.entries()) {
      for (let quarter = 0; quarter < QUARTERS_PER_DAY; quarter++) {
        const seed = actor.seed * 10_000 + dayIndex * 100 + quarter;
        if (deterministicFraction(seed) >= actor.busyThreshold) {
          continue;
        }
        const start = new Date(day);
        start.setHours(8, 0, 0, 0);
        start.setMinutes(start.getMinutes() + quarter * QUARTER_MINUTES);
        const end = new Date(start.getTime() + BOOKING_MINUTES * 60 * 1000);
        const patient = patients[Math.floor(deterministicFraction(seed + 1) * patients.length)];
        const key = `${actor.key}-d${dayIndex}-q${quarter}`;
        await ensureBusyBooking(medplum, key, actor.schedule, actor.actorRef, patient, start, end, cystoscopy);
        bookingCount++;
      }
    }
  }
  console.log(`Pre-existing busy bookings: ${bookingCount} across ${businessDays.length} business days x 5 actors`);

  // A few unconfirmed ("pending") appointments so the Calendar screen's
  // striped color-coding and Confirm action are demoable end-to-end
  // (Calendar & Availability spec §4.5, §8) — deterministic 90-minute slots
  // starting at 17:00 (after the dense 8am-5pm occupancy loop above, so they
  // don't collide with it).
  const pendingBookings: { key: string; actor: OccupancyActor; dayOffset: number; patientIndex: number }[] = [
    { key: 'pending-chen', actor: occupancyActors[0], dayOffset: 0, patientIndex: 0 },
    { key: 'pending-reyes', actor: occupancyActors[1], dayOffset: 2, patientIndex: 1 },
    { key: 'pending-rooma', actor: occupancyActors[2], dayOffset: 5, patientIndex: 2 % patients.length },
  ];
  for (const pending of pendingBookings) {
    const start = new Date(businessDays[pending.dayOffset]);
    start.setHours(17, 0, 0, 0);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    await ensurePendingBooking(
      medplum,
      pending.key,
      pending.actor.schedule,
      pending.actor.actorRef,
      patients[pending.patientIndex],
      start,
      end,
      cystoscopy
    );
  }
  console.log(`Unconfirmed (pending) appointments: ${pendingBookings.length}`);

  // Holds — provider out of office / room maintenance / device calibration —
  // distinct from patient bookings: Slot only, no Appointment, no patient.
  const holdDay = (offset: number): Date => businessDays[offset];

  await ensureHold(
    medplum,
    'chen-out-of-office',
    chenSchedule,
    (() => {
      const d = new Date(holdDay(4));
      d.setHours(8, 0, 0, 0);
      return d;
    })(),
    (() => {
      const d = new Date(holdDay(4));
      d.setHours(17, 0, 0, 0);
      return d;
    })()
  );
  await ensureHold(
    medplum,
    'rooma-maintenance',
    roomASchedule,
    (() => {
      const d = new Date(holdDay(6));
      d.setHours(8, 0, 0, 0);
      return d;
    })(),
    (() => {
      const d = new Date(holdDay(6));
      d.setHours(12, 0, 0, 0);
      return d;
    })()
  );
  await ensureHold(
    medplum,
    'device-calibration',
    deviceSchedule,
    (() => {
      const d = new Date(holdDay(1));
      d.setHours(13, 0, 0, 0);
      return d;
    })(),
    (() => {
      const d = new Date(holdDay(1));
      d.setHours(17, 0, 0, 0);
      return d;
    })()
  );
  console.log('Holds: Dr. Chen out of office (1 day), Room A maintenance (1 morning), Device calibration (1 afternoon)');

  console.log('\nSeed complete. Resource references:');
  console.log(`  HealthcareServices: ${getReferenceString(cystoscopy)}, ${getReferenceString(consult)}`);
  console.log(`  Practitioners: ${getReferenceString(chen)}, ${getReferenceString(reyes)}`);
  console.log(`  Rooms: ${getReferenceString(roomA)}, ${getReferenceString(roomB)}`);
  console.log(`  Device: ${getReferenceString(device)}`);
  console.log(
    `  Schedules: ${[chenSchedule, reyesSchedule, roomASchedule, roomBSchedule, deviceSchedule]
      .map((s) => getReferenceString(s))
      .join(', ')}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
