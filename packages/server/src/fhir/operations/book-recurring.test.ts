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
import { tagWeeklySeries } from './utils/recurrence';
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

  function bookRecurring(appointments: Appointment[]): ReturnType<typeof request.post> {
    return request
      .post('/fhir/R4/Appointment/$book')
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send({
        resourceType: 'Parameters',
        parameter: appointments.map((appointment) => ({ name: 'appointment', resource: appointment })),
      });
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
    // The one series found, as the nested Bundle of its occurrences.
    const [series] = (findResponse.body as Bundle<Bundle<Appointment>>).entry ?? [];
    const proposedAppointments = (series.resource?.entry ?? []).map((e) => e.resource as Appointment);
    expect(proposedAppointments).toHaveLength(3);
    expect(proposedAppointments.map((a) => a.identifier)).toEqual([undefined, undefined, undefined]);

    // Submitted out of order: occurrence 1 is still booked first, so the others can refer back to it.
    const bookResponse = await bookRecurring(proposedAppointments.toReversed());
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
    // alignment timezone, which defaults to UTC.
    const templates = appointments.map((a) => getExtension(a, RecurrenceTemplateExtensionURI));
    expect(templates.slice(1)).toEqual([undefined, undefined]);
    expect(templates[0]).toEqual({
      url: RecurrenceTemplateExtensionURI,
      extension: [
        {
          url: 'timezone',
          valueCodeableConcept: { coding: [{ system: 'https://www.iana.org/time-zones', code: 'Etc/UTC' }] },
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

    const response = await bookRecurring([
      makeOccurrence(schedule, '2026-03-09T13:00:00.000Z', '2026-03-09T14:00:00.000Z'),
      makeOccurrence(schedule, '2026-03-16T13:00:00.000Z', '2026-03-16T14:00:00.000Z'),
    ]);
    expect(response).toHaveStatus(201);

    const slots = ((response.body as Bundle).entry ?? [])
      .map((e) => e.resource)
      .filter(isDefined)
      .filter(isSlot);
    expect(slots).toHaveLength(2);
    expect(slots.map((slot) => getExtension(slot, SchedulingSlotCapacityURI)?.valuePositiveInt)).toEqual([2, 2]);
  });

  test('rebuilds the series tags rather than trusting the ones it was sent', async () => {
    const schedule = await makeSchedule();
    const forged = tagWeeklySeries(
      [
        makeOccurrence(schedule, '2026-03-09T13:00:00.000Z', '2026-03-09T14:00:00.000Z'),
        makeOccurrence(schedule, '2026-03-16T13:00:00.000Z', '2026-03-16T14:00:00.000Z'),
      ],
      'client-chosen',
      'America/New_York'
    ).map((appointment) => ({
      ...appointment,
      extension: [
        ...(appointment.extension ?? []).map((e) =>
          // A template claiming a timezone the schedule does not keep.
          e.url === RecurrenceTemplateExtensionURI
            ? {
                ...e,
                extension: e.extension?.map((sub) =>
                  sub.url === 'timezone'
                    ? { url: 'timezone', valueCodeableConcept: { coding: [{ code: 'Asia/Tokyo' }] } }
                    : sub
                ),
              }
            : e
        ),
        { url: OriginatingAppointmentExtensionURI, valueReference: { reference: 'Appointment/somewhere-else' } },
      ],
    }));

    const response = await bookRecurring(forged);
    expect(response).toHaveStatus(201);
    const appointments = ((response.body as Bundle).entry ?? [])
      .map((e) => e.resource)
      .filter(isDefined)
      .filter(isAppointment);
    expect(appointments).toHaveLength(2);

    for (const appointment of appointments) {
      const seriesIdentifiers = appointment.identifier?.filter(
        (identifier) => identifier.system === RecurringAppointmentSeriesIdentifierSystem
      );
      expect(seriesIdentifiers).toHaveLength(1);
      expect(seriesIdentifiers?.[0].value).not.toBe('client-chosen');
      expect(appointment.extension?.filter((e) => e.url === RecurrenceIdExtensionURI)).toHaveLength(1);
    }

    const [first, second] = appointments;
    // The schedule sets no alignmentTimezone, so the series keeps UTC.
    expect(getExtension(first, RecurrenceTemplateExtensionURI, 'timezone')?.valueCodeableConcept).toEqual({
      coding: [{ system: 'https://www.iana.org/time-zones', code: 'Etc/UTC' }],
    });
    expect(getExtension(first, RecurrenceTemplateExtensionURI, 'weeklyTemplate', 'monday')?.valueBoolean).toBe(true);
    expect(getExtension(first, OriginatingAppointmentExtensionURI)).toBeUndefined();
    expect(second.extension?.filter((e) => e.url === OriginatingAppointmentExtensionURI)).toEqual([
      expect.objectContaining({ valueReference: expect.objectContaining({ reference: `Appointment/${first.id}` }) }),
    ]);
  });

  test('rejects a series that is not one week apart', async () => {
    const schedule = await makeSchedule();
    const occurrences = [
      makeOccurrence(schedule, '2026-03-09T13:00:00.000Z', '2026-03-09T14:00:00.000Z'),
      makeOccurrence(schedule, '2026-03-23T13:00:00.000Z', '2026-03-23T14:00:00.000Z'),
    ];

    const response = await bookRecurring(occurrences);
    expect(response).toHaveStatus(400);
    expect(response.body.issue[0].details.text).toBe(
      'Appointments in a recurring series must be one week apart, at the same local time'
    );
  });

  test("rejects a series whose appointment times don't match the Slots they book", async () => {
    const schedule = await makeSchedule();
    // Weekly by Appointment.start, but the second occurrence books a Slot two weeks out.
    const second = makeOccurrence(schedule, '2026-03-23T13:00:00.000Z', '2026-03-23T14:00:00.000Z');
    second.start = '2026-03-16T13:00:00.000Z';
    second.end = '2026-03-16T14:00:00.000Z';

    const response = await bookRecurring([
      makeOccurrence(schedule, '2026-03-09T13:00:00.000Z', '2026-03-09T14:00:00.000Z'),
      second,
    ]);
    expect(response).toHaveStatus(400);
    expect(response.body.issue[0].details.text).toBe("Appointment start and end must match its busy Slot's");
    expect(response.body.issue[0].expression).toEqual(['Parameters.appointment[1]']);
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

  test('rolls back the entire series when a later occurrence has become unavailable', async () => {
    const schedule = await makeSchedule();
    const occurrences = [
      makeOccurrence(schedule, '2026-03-09T13:00:00.000Z', '2026-03-09T14:00:00.000Z'),
      makeOccurrence(schedule, '2026-03-16T13:00:00.000Z', '2026-03-16T14:00:00.000Z'),
      makeOccurrence(schedule, '2026-03-23T13:00:00.000Z', '2026-03-23T14:00:00.000Z'),
    ];

    // Simulate another booking racing in on the 3rd occurrence between $find and $book.
    await systemRepo.createResource<Slot>({
      resourceType: 'Slot',
      meta: { project: project.project.id },
      schedule: createReference(schedule),
      status: 'busy',
      start: '2026-03-23T13:00:00.000Z',
      end: '2026-03-23T14:00:00.000Z',
    });

    const response = await bookRecurring(occurrences);
    expect(response).toHaveStatus(400);

    // The first two occurrences were created before the third was found unavailable, and rolled back.
    const appointments = await systemRepo.searchResources<Appointment>(
      parseSearchRequest(`Appointment?practitioner=${schedule.actor[0].reference}`)
    );
    expect(appointments).toHaveLength(0);

    // Only the one pre-existing conflicting slot exists; no additional slots were created.
    const slots = await systemRepo.searchResources<Slot>(parseSearchRequest(`Slot?schedule=Schedule/${schedule.id}`));
    expect(slots).toHaveLength(1);
  });
});
