// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import {
  arrayify,
  createReference,
  getExtension,
  isDefined,
  parseSearchRequest,
  RecurrenceIdExtensionURI,
  RecurrenceTemplateExtensionURI,
  RecurringAppointmentSeriesIdentifierSystem,
  TimezoneExtensionURI,
  toServiceTypeCodeableConcepts,
  UCUM,
} from '@medplum/core';
import type {
  Appointment,
  Bundle,
  Extension,
  HealthcareService,
  Practitioner,
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

const app = express();
const request = supertest(app);

// A weekly series on Mondays in New York, shaped as `$find` returns it.
function recurrenceTemplate(occurrenceCount: number, overrides: Extension[] = []): Extension {
  const elements: Extension[] = [
    {
      url: 'timezone',
      valueCodeableConcept: { coding: [{ system: 'https://www.iana.org/time-zones', code: 'America/New_York' }] },
    },
    { url: 'recurrenceType', valueCodeableConcept: { coding: [{ system: UCUM, code: 'wk', display: 'week' }] } },
    { url: 'occurrenceCount', valuePositiveInt: occurrenceCount },
    {
      url: 'weeklyTemplate',
      extension: [
        { url: 'monday', valueBoolean: true },
        { url: 'weekInterval', valuePositiveInt: 1 },
      ],
    },
  ];
  return {
    url: RecurrenceTemplateExtensionURI,
    extension: [...elements.filter((e) => !overrides.some((o) => o.url === e.url)), ...overrides],
  };
}

// The operations that take a series, and the statuses each gives the occurrences it creates.
const operations = [
  { operation: '$book', appointmentStatus: 'booked', slotStatus: 'busy' },
  { operation: '$hold', appointmentStatus: 'pending', slotStatus: 'busy-tentative' },
] as const;

describe('Appointment/$book and $hold with a recurrenceTemplate', () => {
  let project: TestProjectResult<{ withAccessToken: true; withRepo: true }>;
  let officeVisitService: WithId<HealthcareService>;
  let systemRepo: SystemRepository;

  beforeAll(async () => {
    const config = await loadTestConfig();
    // try to be more resilient to concurrent tests touching the same tables
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

  // A fresh Practitioner and Schedule per test, so searches can't see another test's bookings.
  // Available Mondays 8-10am New York time, for 60 minute appointments with a 30 minute buffer before.
  async function makeSchedule(): Promise<WithId<Schedule>> {
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
                    { url: 'availableStartTime', valueTime: '08:00:00' },
                    { url: 'availableEndTime', valueTime: '10:00:00' },
                  ],
                },
              ],
            },
            { url: 'duration', valueDuration: { value: 60, unit: 'min' } },
            { url: 'bufferBefore', valueDuration: { value: 30, unit: 'min' } },
            { url: 'service', valueReference: createReference(officeVisitService) },
          ],
        },
      ],
    });
  }

  // The first occurrence of a series at 9am New York time on Monday, March 2nd, 2026 (EST).
  function firstOccurrence(schedule: WithId<Schedule>, template: Extension): Appointment {
    return {
      resourceType: 'Appointment',
      status: 'proposed',
      start: '2026-03-02T14:00:00.000Z',
      end: '2026-03-02T15:00:00.000Z',
      serviceType: toServiceTypeCodeableConcepts(officeVisitService),
      participant: [{ actor: schedule.actor[0], status: 'tentative' }],
      extension: [template],
      contained: [
        {
          resourceType: 'Slot',
          status: 'busy-unavailable',
          schedule: createReference(schedule),
          start: '2026-03-02T13:30:00.000Z',
          end: '2026-03-02T14:00:00.000Z',
        },
        {
          resourceType: 'Slot',
          status: 'busy',
          schedule: createReference(schedule),
          start: '2026-03-02T14:00:00.000Z',
          end: '2026-03-02T15:00:00.000Z',
        },
      ],
    };
  }

  function book(appointment: Appointment, operation: '$book' | '$hold' = '$book'): ReturnType<typeof request.post> {
    return request
      .post(`/fhir/R4/Appointment/${operation}`)
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send({ resourceType: 'Parameters', parameter: [{ name: 'appointment', resource: appointment }] });
  }

  test.each(operations)('$operation creates every occurrence, keeping its local time across DST', async (params) => {
    const { operation, appointmentStatus, slotStatus } = params;
    const schedule = await makeSchedule();

    const response = await book(
      {
        ...firstOccurrence(schedule, recurrenceTemplate(3)),
        requestedPeriod: [{ start: '2026-03-02T13:00:00.000Z', end: '2026-03-02T17:00:00.000Z' }],
      },
      operation
    );
    expect(response).toHaveStatus(201);

    const resources = ((response.body as Bundle).entry ?? []).map((e) => e.resource).filter(isDefined);
    const appointments = resources.filter((r): r is WithId<Appointment> => r.resourceType === 'Appointment');
    const slots = resources.filter((r): r is WithId<Slot> => r.resourceType === 'Slot');

    // 9am EST, then 9am EDT after DST starts on March 8th.
    expect(appointments.map((a) => [a.status, a.start, a.end])).toEqual([
      [appointmentStatus, '2026-03-02T14:00:00.000Z', '2026-03-02T15:00:00.000Z'],
      [appointmentStatus, '2026-03-09T13:00:00.000Z', '2026-03-09T14:00:00.000Z'],
      [appointmentStatus, '2026-03-16T13:00:00.000Z', '2026-03-16T14:00:00.000Z'],
    ]);
    // Every occurrence holds its own Slots, buffer included, shifted along with it.
    expect(slots.map((s) => [s.status, s.start, s.end]).sort()).toEqual(
      [
        ['busy-unavailable', '2026-03-02T13:30:00.000Z', '2026-03-02T14:00:00.000Z'],
        [slotStatus, '2026-03-02T14:00:00.000Z', '2026-03-02T15:00:00.000Z'],
        ['busy-unavailable', '2026-03-09T12:30:00.000Z', '2026-03-09T13:00:00.000Z'],
        [slotStatus, '2026-03-09T13:00:00.000Z', '2026-03-09T14:00:00.000Z'],
        ['busy-unavailable', '2026-03-16T12:30:00.000Z', '2026-03-16T13:00:00.000Z'],
        [slotStatus, '2026-03-16T13:00:00.000Z', '2026-03-16T14:00:00.000Z'],
      ].sort()
    );

    expect(appointments.map((a) => getExtension(a, RecurrenceIdExtensionURI)?.valuePositiveInt)).toEqual([1, 2, 3]);
    // Only the first occurrence keeps the period requested for it.
    expect(appointments.map((a) => a.requestedPeriod)).toEqual([
      [{ start: '2026-03-02T13:00:00.000Z', end: '2026-03-02T17:00:00.000Z' }],
      undefined,
      undefined,
    ]);

    // One identifier, shared by every occurrence, finds the whole series again.
    const seriesIds = appointments.map(
      (a) => a.identifier?.find((id) => id.system === RecurringAppointmentSeriesIdentifierSystem)?.value
    );
    expect(seriesIds[0]).toBeDefined();
    expect(new Set(seriesIds).size).toBe(1);
    const found = await systemRepo.searchResources<Appointment>(
      parseSearchRequest(`Appointment?identifier=${RecurringAppointmentSeriesIdentifierSystem}|${seriesIds[0]}`)
    );
    expect(found.map((a) => a.id).sort()).toEqual(appointments.map((a) => a.id).sort());
  });

  test.each(operations)('$operation creates a series as $find proposes it', async ({ operation }) => {
    const schedule = await makeSchedule();
    const found = await request
      .get('/fhir/R4/Appointment/$find')
      .set('Authorization', `Bearer ${project.accessToken}`)
      .query({
        'service-type-reference': `HealthcareService/${officeVisitService.id}`,
        schedule: `Schedule/${schedule.id}`,
        start: '2026-03-02T05:00:00.000Z',
        end: '2026-03-03T05:00:00.000Z',
        'occurrence-count': 3,
      });
    expect(found).toHaveStatus(200);
    const proposed = (found.body as Bundle<Appointment>).entry?.[0]?.resource;
    expect(proposed).toBeDefined();

    const response = await book(proposed as Appointment, operation);
    expect(response).toHaveStatus(201);
    const appointments = ((response.body as Bundle).entry ?? [])
      .map((e) => e.resource)
      .filter((r): r is WithId<Appointment> => r?.resourceType === 'Appointment');
    // 9am New York time each week, as in `firstOccurrence`.
    expect(appointments.map((a) => [a.start, getExtension(a, RecurrenceIdExtensionURI)?.valuePositiveInt])).toEqual([
      ['2026-03-02T14:00:00.000Z', 1],
      ['2026-03-09T13:00:00.000Z', 2],
      ['2026-03-16T13:00:00.000Z', 3],
    ]);
  });

  test('books a series sent at a timezone offset', async () => {
    const schedule = await makeSchedule();
    const first = firstOccurrence(schedule, recurrenceTemplate(2));

    // The same times as `firstOccurrence`, at New York's offset rather than UTC.
    const response = await book({
      ...first,
      start: '2026-03-02T09:00:00-05:00',
      end: '2026-03-02T10:00:00-05:00',
      contained: [
        { ...(first.contained?.[0] as Slot), start: '2026-03-02T08:30:00-05:00', end: '2026-03-02T09:00:00-05:00' },
        { ...(first.contained?.[1] as Slot), start: '2026-03-02T09:00:00-05:00', end: '2026-03-02T10:00:00-05:00' },
      ],
    });
    expect(response).toHaveStatus(201);

    const appointments = ((response.body as Bundle).entry ?? [])
      .map((e) => e.resource)
      .filter((r): r is WithId<Appointment> => r?.resourceType === 'Appointment');
    const toISO = (instant: string | undefined): string | undefined => instant && new Date(instant).toISOString();
    expect(appointments.map((a) => [toISO(a.start), toISO(a.end)])).toEqual([
      ['2026-03-02T14:00:00.000Z', '2026-03-02T15:00:00.000Z'],
      ['2026-03-09T13:00:00.000Z', '2026-03-09T14:00:00.000Z'],
    ]);
  });

  test.each<{ refuses: string; edit: (appointment: Appointment) => void; expression: string }>([
    {
      refuses: 'a start with no timezone offset',
      edit: (appointment) => {
        appointment.start = '2026-03-02T09:00:00';
      },
      expression: 'Parameters.appointment.start',
    },
    {
      refuses: 'an end with no timezone offset',
      edit: (appointment) => {
        appointment.end = '2026-03-02T10:00:00';
      },
      expression: 'Parameters.appointment.end',
    },
    {
      refuses: 'a Slot start at a leap second',
      edit: (appointment) => {
        (appointment.contained?.[0] as Slot).start = '2026-03-02T13:29:60.000Z';
      },
      expression: 'Parameters.appointment.contained[0].start',
    },
    {
      refuses: 'a Slot end with no timezone offset',
      edit: (appointment) => {
        (appointment.contained?.[1] as Slot).end = '2026-03-02T10:00:00';
      },
      expression: 'Parameters.appointment.contained[1].end',
    },
  ])('refuses a series with $refuses', async ({ edit, expression }) => {
    const schedule = await makeSchedule();
    const appointment = firstOccurrence(schedule, recurrenceTemplate(3));
    edit(appointment);

    // Sent bare: in Parameters, validation would refuse a time with no offset before $book saw it.
    const response = await request
      .post('/fhir/R4/Appointment/$book')
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send(appointment);
    expect(response).toHaveStatus(400);
    expect(response.body.issue[0].expression).toEqual([expression]);
    expect(response.body.issue[0].details.text).toContain(
      'Times in a recurring series must be instants, with a timezone offset'
    );
  });

  test.each(operations)('$operation creates none of the series when one is unavailable', async ({ operation }) => {
    const schedule = await makeSchedule();
    // Another booking already holds the last occurrence's time.
    await systemRepo.createResource<Slot>({
      resourceType: 'Slot',
      meta: { project: project.project.id },
      schedule: createReference(schedule),
      status: 'busy',
      start: '2026-03-16T13:00:00.000Z',
      end: '2026-03-16T14:00:00.000Z',
    });

    const response = await book(firstOccurrence(schedule, recurrenceTemplate(3)), operation);
    expect(response).toHaveStatus(400);

    const appointments = await systemRepo.searchResources<Appointment>(
      parseSearchRequest(`Appointment?actor=${schedule.actor[0].reference}`)
    );
    expect(appointments).toHaveLength(0);
    const slots = await systemRepo.searchResources<Slot>(parseSearchRequest(`Slot?schedule=Schedule/${schedule.id}`));
    expect(slots.map((s) => s.start)).toEqual(['2026-03-16T13:00:00.000Z']);
  });

  test('$confirm books one held occurrence, leaving the rest of the series held', async () => {
    const schedule = await makeSchedule();
    const held = await book(firstOccurrence(schedule, recurrenceTemplate(3)), '$hold');
    expect(held).toHaveStatus(201);
    const appointments = ((held.body as Bundle).entry ?? [])
      .map((e) => e.resource)
      .filter((r): r is WithId<Appointment> => r?.resourceType === 'Appointment');

    const confirmed = await request
      .post(`/fhir/R4/Appointment/${appointments[1].id}/$confirm`)
      .set('Authorization', `Bearer ${project.accessToken}`);
    expect(confirmed).toHaveStatus(200);

    const statuses = await Promise.all(
      appointments.map(async (a) => (await systemRepo.readResource<Appointment>('Appointment', a.id)).status)
    );
    expect(statuses).toEqual(['pending', 'booked', 'pending']);
  });

  test.each<{
    refuses: string;
    template?: Extension;
    sent?: Pick<Appointment, 'identifier' | 'extension' | 'start'>;
    expression: string | string[];
    message: string;
  }>([
    {
      refuses: 'more than 6 occurrences',
      template: { url: 'occurrenceCount', valuePositiveInt: 7 },
      expression: 'Parameters.appointment.extension[0]',
      message: 'occurrenceCount must be an integer between 2 and 6',
    },
    {
      refuses: 'a single occurrence',
      template: { url: 'occurrenceCount', valuePositiveInt: 1 },
      expression: 'Parameters.appointment.extension[0]',
      message: 'occurrenceCount must be an integer between 2 and 6',
    },
    {
      refuses: 'a daily recurrence',
      template: { url: 'recurrenceType', valueCodeableConcept: { coding: [{ system: UCUM, code: 'd' }] } },
      expression: 'Parameters.appointment.extension[0]',
      message: "must be a weekly series on the first occurrence's weekday, as Appointment/$find returns it",
    },
    {
      refuses: 'excluded dates',
      template: { url: 'excludingDate', valueDate: '2026-03-09' },
      expression: 'Parameters.appointment.extension[0]',
      message: "must be a weekly series on the first occurrence's weekday, as Appointment/$find returns it",
    },
    {
      refuses: "a weekday other than the first occurrence's",
      template: {
        url: 'weeklyTemplate',
        extension: [
          { url: 'tuesday', valueBoolean: true },
          { url: 'weekInterval', valuePositiveInt: 1 },
        ],
      },
      expression: 'Parameters.appointment.extension[0]',
      message: "must be a weekly series on the first occurrence's weekday, as Appointment/$find returns it",
    },
    {
      refuses: 'an unknown timezone',
      template: {
        url: 'timezone',
        valueCodeableConcept: { coding: [{ system: 'https://www.iana.org/time-zones', code: 'Mars/Olympus_Mons' }] },
      },
      expression: 'Parameters.appointment.extension[0]',
      message: 'timezone must be an IANA timezone',
    },
    {
      refuses: 'a UTC offset for its timezone',
      template: {
        url: 'timezone',
        valueCodeableConcept: { coding: [{ system: 'https://www.iana.org/time-zones', code: '-05:00' }] },
      },
      expression: 'Parameters.appointment.extension[0]',
      message: 'timezone must be an IANA timezone',
    },
    {
      refuses: 'a second recurrenceTemplate',
      sent: { extension: [recurrenceTemplate(2)] },
      expression: ['Parameters.appointment.extension[0]', 'Parameters.appointment.extension[1]'],
      message: 'Too many recurrenceTemplate extensions',
    },
    {
      refuses: 'an occurrence at a local time skipped by DST',
      // 2:30am on Sundays, which New York skips on March 8th.
      template: {
        url: 'weeklyTemplate',
        extension: [
          { url: 'sunday', valueBoolean: true },
          { url: 'weekInterval', valuePositiveInt: 1 },
        ],
      },
      sent: { start: '2026-03-01T07:30:00.000Z' },
      expression: 'Parameters.appointment.extension[0]',
      message: "occurrence 2 falls at a local time that doesn't exist in America/New_York",
    },
    {
      refuses: 'no start',
      sent: { start: undefined },
      expression: 'Parameters.appointment.start',
      message: 'Times in a recurring series must be instants, with a timezone offset',
    },
    {
      refuses: 'a start at a leap second',
      sent: { start: '2026-03-02T13:59:60.000Z' },
      expression: 'Parameters.appointment.start',
      message: 'Times in a recurring series must be instants, with a timezone offset',
    },
    {
      refuses: 'a series identifier sent by the client',
      sent: { identifier: [{ system: RecurringAppointmentSeriesIdentifierSystem, value: 'client-chosen' }] },
      expression: 'Parameters.appointment.identifier[0]',
      message: 'A series identifier is assigned to each occurrence of a recurring series, and must not be sent',
    },
    {
      refuses: 'a recurrenceId sent by the client',
      sent: { extension: [{ url: RecurrenceIdExtensionURI, valuePositiveInt: 2 }] },
      expression: 'Parameters.appointment.extension[1]',
      message: 'recurrenceId is assigned to each occurrence of a recurring series, and must not be sent',
    },
  ])('refuses a series with $refuses', async ({ template, sent, expression, message }) => {
    const schedule = await makeSchedule();
    const first = firstOccurrence(schedule, recurrenceTemplate(3, template ? [template] : []));

    const response = await book({
      ...first,
      ...sent,
      extension: [...(first.extension ?? []), ...(sent?.extension ?? [])],
    });
    expect(response).toHaveStatus(400);
    expect(response.body.issue[0].expression).toEqual(arrayify(expression));
    expect(response.body.issue[0].details.text).toContain(message);
  });
});
