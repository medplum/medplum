// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import {
  createReference,
  getExtension,
  isDefined,
  OriginatingAppointmentExtensionURI,
  parseSearchRequest,
  RecurrenceIdExtensionURI,
  RecurrenceTemplateExtensionURI,
  RecurringAppointmentSeriesIdentifierSystem,
  SchedulingSlotCapacityURI,
  TimezoneExtensionURI,
  toServiceTypeCodeableConcepts,
  UCUM,
} from '@medplum/core';
import type {
  Appointment,
  Bundle,
  HealthcareService,
  Practitioner,
  Resource,
  Schedule,
  Slot,
} from '@medplum/fhirtypes';
import express from 'express';
import supertest from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import type { SystemRepository } from '../../fhir/repo';
import type { TestProjectResult } from '../../test.setup';
import { createTestProject } from '../../test.setup';
import { withPaths } from '../../util/withpath';
import { weeklyTemplate } from './utils/recurrence';
import { createProposedAppointments } from './utils/scheduling';

const app = express();
const request = supertest(app);

function isAppointment(obj: Resource): obj is Appointment {
  return obj.resourceType === 'Appointment';
}

function isSlot(obj: Resource): obj is Slot {
  return obj.resourceType === 'Slot';
}

describe('Appointment/$book with a recurring series', () => {
  let project: TestProjectResult<{ withAccessToken: true; withRepo: true }>;
  let officeVisitService: WithId<HealthcareService>;
  let systemRepo: SystemRepository;

  beforeAll(async () => {
    const config = await loadTestConfig();
    config.transactionAttempts = 5;
    await initApp(app, config);
    project = await createTestProject({ withAccessToken: true, withRepo: true });
    systemRepo = project.repo.getSystemRepo();
    officeVisitService = await systemRepo.createResource<HealthcareService>({
      resourceType: 'HealthcareService',
      name: 'Office Visit',
      type: [{ coding: [{ system: 'https://example.com/fhir', code: 'office-visit' }] }],
      meta: { project: project.project.id },
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  // Each test gets its own Practitioner/Schedule so that searches scoped to one test's
  // practitioner can't see Appointments created by a different test.
  async function makeSchedule(opts?: { slotCapacity?: number }): Promise<WithId<Schedule>> {
    const practitioner = await systemRepo.createResource<Practitioner>({
      resourceType: 'Practitioner',
      meta: { project: project.project.id },
      extension: [{ url: TimezoneExtensionURI, valueCode: 'America/New_York' }],
    });
    return systemRepo.createResource<Schedule>({
      resourceType: 'Schedule',
      meta: { project: project.project.id },
      actor: [createReference(practitioner)],
      serviceType: toServiceTypeCodeableConcepts(officeVisitService),
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [
            {
              url: 'availability',
              extension: [
                {
                  url: 'availableTime',
                  extension: [
                    { url: 'daysOfWeek', valueCode: 'mon' },
                    { url: 'availableStartTime', valueTime: '09:00:00' },
                    { url: 'availableEndTime', valueTime: '10:00:00' },
                  ],
                },
              ],
            },
            { url: 'duration', valueDuration: { value: 60, unit: 'min' } },
            { url: 'service', valueReference: createReference(officeVisitService) },
            ...(opts?.slotCapacity ? [{ url: 'slotCapacity', valuePositiveInt: opts.slotCapacity }] : []),
          ],
        },
      ],
    });
  }

  function makeOccurrence(schedule: WithId<Schedule>, start: string, end: string): Appointment {
    return {
      resourceType: 'Appointment',
      status: 'proposed',
      start,
      end,
      serviceType: toServiceTypeCodeableConcepts(officeVisitService),
      participant: [{ actor: schedule.actor[0], status: 'tentative' }],
      contained: [
        {
          resourceType: 'Slot',
          status: 'busy',
          schedule: createReference(schedule),
          start,
          end,
        } satisfies Slot,
      ],
    } satisfies Appointment;
  }

  function book(appointment: Appointment): ReturnType<typeof request.post> {
    return request
      .post('/fhir/R4/Appointment/$book')
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send({ resourceType: 'Parameters', parameter: [{ name: 'appointment', resource: appointment }] });
  }

  function templated(first: Appointment, template: ReturnType<typeof weeklyTemplate>): Appointment {
    return { ...first, extension: [...(first.extension ?? []), template] };
  }

  function bookedAppointments(response: Awaited<ReturnType<typeof book>>): WithId<Appointment>[] {
    return ((response.body as Bundle).entry ?? [])
      .map((e) => e.resource)
      .filter(isDefined)
      .filter(isAppointment) as WithId<Appointment>[];
  }

  test('books every occurrence of a series returned by $find, atomically', async () => {
    const schedule = await makeSchedule();

    const findResponse = await request
      .get('/fhir/R4/Appointment/$find')
      .set('Authorization', `Bearer ${project.accessToken}`)
      .query({
        start: new Date('2026-03-09T00:00:00-04:00').toISOString(),
        end: new Date('2026-03-10T00:00:00-04:00').toISOString(),
        'service-type-reference': `HealthcareService/${officeVisitService.id}`,
        schedule: `Schedule/${schedule.id}`,
        'occurrence-count': '3',
        _count: '1',
      });
    expect(findResponse).toHaveStatus(200);
    // The one series found, as its first occurrence, passed to `$book` as it was returned.
    const [series] = (findResponse.body as Bundle<Appointment>).entry ?? [];
    const bookResponse = await book(series.resource as Appointment);
    expect(bookResponse).toHaveStatus(201);

    const entries = ((bookResponse.body as Bundle).entry ?? []).map((e) => e.resource).filter(isDefined);
    const appointments = entries.filter(isAppointment);
    const slots = entries.filter(isSlot);
    expect(appointments).toHaveLength(3);
    expect(slots).toHaveLength(3);
    appointments.forEach((appointment) => expect(appointment.status).toBe('booked'));
    expect(appointments.map((a) => a.start)).toEqual([
      '2026-03-09T13:00:00.000Z',
      '2026-03-16T13:00:00.000Z',
      '2026-03-23T13:00:00.000Z',
    ]);
    expect(
      appointments.map((a) => getExtension(a, OriginatingAppointmentExtensionURI)?.valueReference?.reference)
    ).toEqual([undefined, `Appointment/${appointments[0].id}`, `Appointment/${appointments[0].id}`]);
    expect(appointments.map((a) => getExtension(a, RecurrenceIdExtensionURI)?.valuePositiveInt)).toEqual([1, 2, 3]);

    // Only the first occurrence says how the series recurs: weekly on Mondays, in the schedule's
    // own timezone, although its alignment timezone is left at the default of UTC.
    const templates = appointments.map((a) => getExtension(a, RecurrenceTemplateExtensionURI));
    expect(templates.slice(1)).toEqual([undefined, undefined]);
    expect(templates[0]).toEqual({
      url: RecurrenceTemplateExtensionURI,
      extension: [
        {
          url: 'timezone',
          valueCodeableConcept: { coding: [{ system: 'https://www.iana.org/time-zones', code: 'America/New_York' }] },
        },
        {
          url: 'recurrenceType',
          valueCodeableConcept: { coding: [{ system: UCUM, code: 'wk', display: 'week' }] },
        },
        { url: 'occurrenceCount', valuePositiveInt: 3 },
        {
          url: 'weeklyTemplate',
          extension: [
            { url: 'monday', valueBoolean: true },
            { url: 'weekInterval', valuePositiveInt: 1 },
          ],
        },
      ],
    });

    // The series identifier is what finds every occurrence of it again.
    const seriesIdentifier = appointments[0].identifier?.find(
      (identifier) => identifier.system === RecurringAppointmentSeriesIdentifierSystem
    );
    const found = await systemRepo.searchResources<Appointment>(
      parseSearchRequest(`Appointment?identifier=${seriesIdentifier?.system}|${seriesIdentifier?.value}`)
    );
    expect(seriesIdentifier?.value).toBeDefined();
    expect(found.map((a) => a.id).sort()).toEqual(appointments.map((a) => a.id).sort());
  });

  test("stamps every occurrence's Slot with its schedule's capacity, as a single booking does", async () => {
    const schedule = await makeSchedule({ slotCapacity: 2 });

    const start = '2026-03-09T13:00:00.000Z';
    const first = makeOccurrence(schedule, start, '2026-03-09T14:00:00.000Z');

    const response = await book(templated(first, weeklyTemplate(start, 2, 'America/New_York')));
    expect(response).toHaveStatus(201);

    const slots = ((response.body as Bundle).entry ?? [])
      .map((e) => e.resource)
      .filter(isDefined)
      .filter(isSlot);
    expect(slots).toHaveLength(2);
    expect(slots.map((slot) => getExtension(slot, SchedulingSlotCapacityURI)?.valuePositiveInt)).toEqual([2, 2]);
  });

  test("rejects a series whose first appointment's times don't match the Slots it books", async () => {
    const schedule = await makeSchedule();
    // A Monday by Appointment.start, but the Slot it books is a week later.
    const first = makeOccurrence(schedule, '2026-03-16T13:00:00.000Z', '2026-03-16T14:00:00.000Z');
    first.start = '2026-03-09T13:00:00.000Z';
    first.end = '2026-03-09T14:00:00.000Z';

    const response = await book(templated(first, weeklyTemplate(first.start, 2, 'America/New_York')));
    expect(response).toHaveStatus(400);
    expect(response.body.issue[0].details.text).toBe("Appointment start and end must match its busy Slot's");
    expect(response.body.issue[0].expression).toEqual(['Parameters.appointment']);
  });

  test('checks each occurrence against the ones booked before it', async () => {
    const schedule = await makeSchedule();
    // Both hold the same Slot, which a capacity-1 schedule can only book once.
    const occurrences = withPaths(
      [
        makeOccurrence(schedule, '2026-03-09T13:00:00.000Z', '2026-03-09T14:00:00.000Z'),
        makeOccurrence(schedule, '2026-03-09T13:00:00.000Z', '2026-03-09T14:00:00.000Z'),
      ],
      'Parameters.appointment'
    );

    await expect(
      createProposedAppointments(project.repo, occurrences, (validated) =>
        validated.map(({ appointment }) => ({ ...appointment, status: 'booked' }))
      )
    ).rejects.toThrow('Requested time slot is not available');

    const slots = await systemRepo.searchResources<Slot>(parseSearchRequest(`Slot?schedule=Schedule/${schedule.id}`));
    expect(slots).toHaveLength(0);
  });

  test('reads the schedules and service a series books only once', async () => {
    const schedule = await makeSchedule();
    const occurrences = withPaths(
      [
        makeOccurrence(schedule, '2026-03-09T13:00:00.000Z', '2026-03-09T14:00:00.000Z'),
        makeOccurrence(schedule, '2026-03-16T13:00:00.000Z', '2026-03-16T14:00:00.000Z'),
        makeOccurrence(schedule, '2026-03-23T13:00:00.000Z', '2026-03-23T14:00:00.000Z'),
      ],
      'Parameters.appointment'
    );
    const readReference = vi.spyOn(project.repo, 'readReference');
    const readReferences = vi.spyOn(project.repo, 'readReferences');

    try {
      await createProposedAppointments(project.repo, occurrences, (validated) =>
        validated.map(({ appointment }) => ({ ...appointment, status: 'booked' }))
      );
      const read = [
        ...readReference.mock.calls.map(([reference]) => reference),
        ...readReferences.mock.calls.flatMap(([references]) => references),
      ].map((reference) => reference.reference);
      expect(read.sort()).toEqual(
        [`HealthcareService/${officeVisitService.id}`, schedule.actor[0].reference, `Schedule/${schedule.id}`].sort()
      );
    } finally {
      readReference.mockRestore();
      readReferences.mockRestore();
    }
  });

  test('books every occurrence the template describes', async () => {
    const schedule = await makeSchedule();
    const start = '2026-03-09T13:00:00.000Z';
    const first = makeOccurrence(schedule, start, '2026-03-09T14:00:00.000Z');

    const response = await book(templated(first, weeklyTemplate(start, 3, 'America/New_York')));
    expect(response).toHaveStatus(201);

    const appointments = bookedAppointments(response);
    expect(appointments.map((a) => [a.status, a.start, a.end])).toEqual([
      ['booked', '2026-03-09T13:00:00.000Z', '2026-03-09T14:00:00.000Z'],
      ['booked', '2026-03-16T13:00:00.000Z', '2026-03-16T14:00:00.000Z'],
      ['booked', '2026-03-23T13:00:00.000Z', '2026-03-23T14:00:00.000Z'],
    ]);
    const slots = ((response.body as Bundle).entry ?? [])
      .map((e) => e.resource)
      .filter(isDefined)
      .filter(isSlot);
    expect(slots.map((slot) => [slot.status, slot.start])).toEqual([
      ['busy', '2026-03-09T13:00:00.000Z'],
      ['busy', '2026-03-16T13:00:00.000Z'],
      ['busy', '2026-03-23T13:00:00.000Z'],
    ]);

    expect(appointments.map((a) => getExtension(a, RecurrenceIdExtensionURI)?.valuePositiveInt)).toEqual([1, 2, 3]);
    expect(
      appointments.map((a) => getExtension(a, OriginatingAppointmentExtensionURI)?.valueReference?.reference)
    ).toEqual([undefined, `Appointment/${appointments[0].id}`, `Appointment/${appointments[0].id}`]);
    expect(appointments.map((a) => getExtension(a, RecurrenceTemplateExtensionURI))).toEqual([
      weeklyTemplate(start, 3, 'America/New_York'),
      undefined,
      undefined,
    ]);
  });

  test('keeps local time across a DST transition', async () => {
    const schedule = await makeSchedule();
    // 9am EST, then 9am EDT, although the schedule aligns in UTC.
    const start = '2026-03-02T14:00:00.000Z';
    const first = makeOccurrence(schedule, start, '2026-03-02T15:00:00.000Z');

    const response = await book(templated(first, weeklyTemplate(start, 2, 'America/New_York')));
    expect(response).toHaveStatus(201);
    expect(bookedAppointments(response).map((a) => a.start)).toEqual([
      '2026-03-02T14:00:00.000Z',
      '2026-03-09T13:00:00.000Z',
    ]);
  });

  test("rejects a template whose timezone isn't the schedules'", async () => {
    const schedule = await makeSchedule();
    const start = '2026-03-09T13:00:00.000Z';
    // Still a Monday in Tokyo, where it is 10pm.
    const first = makeOccurrence(schedule, start, '2026-03-09T14:00:00.000Z');

    const response = await book(templated(first, weeklyTemplate(start, 2, 'Asia/Tokyo')));
    expect(response).toHaveStatus(400);
    expect(response.body.issue[0].details.text).toBe(
      "recurrenceTemplate timezone must be the schedules' timezone, America/New_York"
    );
    expect(response.body.issue[0].expression).toEqual(['Parameters.appointment.extension[0]']);
  });

  test("rejects a template that doesn't recur on the first occurrence's weekday", async () => {
    const schedule = await makeSchedule();
    const first = makeOccurrence(schedule, '2026-03-09T13:00:00.000Z', '2026-03-09T14:00:00.000Z');

    // Built for a Tuesday.
    const response = await book(templated(first, weeklyTemplate('2026-03-10T13:00:00.000Z', 2, 'America/New_York')));
    expect(response).toHaveStatus(400);
    expect(response.body.issue[0].details.text).toBe(
      "recurrenceTemplate must recur on the first occurrence's weekday, monday"
    );
  });

  test('rejects a template of more than 6 occurrences', async () => {
    const schedule = await makeSchedule();
    const start = '2026-03-09T13:00:00.000Z';
    const first = makeOccurrence(schedule, start, '2026-03-09T14:00:00.000Z');

    const response = await book(templated(first, weeklyTemplate(start, 7, 'America/New_York')));
    expect(response).toHaveStatus(400);
    expect(response.body.issue[0].details.text).toBe(
      'Unsupported recurrenceTemplate: occurrenceCount must be an integer between 2 and 6'
    );
  });

  test('rebuilds the other series tags rather than trusting the ones it was sent', async () => {
    const schedule = await makeSchedule();
    const start = '2026-03-09T13:00:00.000Z';
    const first: Appointment = {
      ...makeOccurrence(schedule, start, '2026-03-09T14:00:00.000Z'),
      identifier: [{ system: RecurringAppointmentSeriesIdentifierSystem, value: 'client-chosen' }],
      extension: [
        { url: RecurrenceIdExtensionURI, valuePositiveInt: 5 },
        { url: OriginatingAppointmentExtensionURI, valueReference: { reference: 'Appointment/somewhere-else' } },
      ],
    };

    const response = await book(templated(first, weeklyTemplate(start, 2, 'America/New_York')));
    expect(response).toHaveStatus(201);

    const appointments = bookedAppointments(response);
    for (const appointment of appointments) {
      const seriesIdentifiers = appointment.identifier?.filter(
        (identifier) => identifier.system === RecurringAppointmentSeriesIdentifierSystem
      );
      expect(seriesIdentifiers).toHaveLength(1);
      expect(seriesIdentifiers?.[0].value).not.toBe('client-chosen');
    }
    expect(appointments.map((a) => getExtension(a, RecurrenceIdExtensionURI)?.valuePositiveInt)).toEqual([1, 2]);
    expect(
      appointments.map((a) => getExtension(a, OriginatingAppointmentExtensionURI)?.valueReference?.reference)
    ).toEqual([undefined, `Appointment/${appointments[0].id}`]);
  });

  test('rolls back the entire series when a later occurrence has become unavailable', async () => {
    const schedule = await makeSchedule();
    const start = '2026-03-09T13:00:00.000Z';
    const first = makeOccurrence(schedule, start, '2026-03-09T14:00:00.000Z');

    // Another booking takes the 3rd occurrence between $find and $book.
    await systemRepo.createResource<Slot>({
      resourceType: 'Slot',
      meta: { project: project.project.id },
      schedule: createReference(schedule),
      status: 'busy',
      start: '2026-03-23T13:00:00.000Z',
      end: '2026-03-23T14:00:00.000Z',
    });

    const response = await book(templated(first, weeklyTemplate(start, 3, 'America/New_York')));
    expect(response).toHaveStatus(400);
    expect(response.body.issue[0].details.text).toBe('Requested time slot is not available');

    const appointments = await systemRepo.searchResources<Appointment>(
      parseSearchRequest(`Appointment?practitioner=${schedule.actor[0].reference}`)
    );
    expect(appointments).toHaveLength(0);
    const slots = await systemRepo.searchResources<Slot>(parseSearchRequest(`Slot?schedule=Schedule/${schedule.id}`));
    expect(slots).toHaveLength(1);
  });
});
