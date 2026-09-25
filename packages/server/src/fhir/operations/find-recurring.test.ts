// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import {
  createReference,
  SchedulingSlotCapacityURI,
  TimezoneExtensionURI,
  toServiceTypeCodeableConcepts,
} from '@medplum/core';
import type {
  Appointment,
  Bundle,
  Extension,
  HealthcareService,
  Practitioner,
  Project,
  Schedule,
  Slot,
} from '@medplum/fhirtypes';
import express from 'express';
import supertest from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import type { SystemRepository } from '../../fhir/repo';
import { createTestProject } from '../../test.setup';
import type { SchedulingParametersExtensionExtension } from './utils/scheduling-parameters';

const app = express();
const request = supertest(app);

// Monday 9am-12pm every week: 3 aligned 1-hour candidates per week (9am, 10am, 11am).
const mondayNineToNoon: SchedulingParametersExtensionExtension = {
  url: 'availability',
  extension: [
    {
      url: 'availableTime',
      extension: [
        { url: 'daysOfWeek', valueCode: 'mon' },
        { url: 'availableStartTime', valueTime: '09:00:00' },
        { url: 'availableEndTime', valueTime: '12:00:00' },
      ],
    },
  ],
};

// Monday 9am-10am every week: exactly one aligned candidate per week.
const mondayNineToTen: SchedulingParametersExtensionExtension = {
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
};

describe('Appointment/$find with occurrence-count', () => {
  let practitioner: WithId<Practitioner>;
  let genericVisit: WithId<HealthcareService>;
  let project: WithId<Project>;
  let accessToken: string;
  let systemRepo: SystemRepository;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    const projectResult = await createTestProject({ withAccessToken: true, withRepo: true });
    project = projectResult.project;
    accessToken = projectResult.accessToken;
    systemRepo = projectResult.repo.getSystemRepo();

    practitioner = await systemRepo.createResource<Practitioner>({
      resourceType: 'Practitioner',
      meta: { project: project.id },
      extension: [{ url: TimezoneExtensionURI, valueCode: 'America/New_York' }],
    });
    genericVisit = await systemRepo.createResource<HealthcareService>({
      resourceType: 'HealthcareService',
      meta: { project: project.id },
      type: [{ coding: [{ system: 'https://example.com', code: 'generic-visit' }] }],
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [
            { url: 'duration', valueDuration: { value: 60, unit: 'min' } },
            { url: 'alignmentTimezone', valueCode: 'America/New_York' },
          ],
        },
      ],
      name: 'Visit',
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  async function makeSchedule(
    availability: SchedulingParametersExtensionExtension,
    opts?: { planningHorizon?: Schedule['planningHorizon']; parameters?: Extension[]; actor?: Practitioner }
  ): Promise<WithId<Schedule>> {
    return systemRepo.createResource<Schedule>({
      resourceType: 'Schedule',
      meta: { project: project.id },
      actor: [createReference(opts?.actor ?? practitioner)],
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [
            availability,
            { url: 'service', valueReference: createReference(genericVisit) },
            ...(opts?.parameters ?? []),
          ],
        },
      ],
      serviceType: toServiceTypeCodeableConcepts(genericVisit),
      planningHorizon: opts?.planningHorizon,
    });
  }

  // Each entry of a series search is one series: a nested Bundle of its occurrences, in order.
  function seriesIn(response: { body: unknown }): Appointment[][] {
    return ((response.body as Bundle<Bundle<Appointment>>).entry ?? []).map((entry) =>
      (entry.resource?.entry ?? []).map((inner) => inner.resource as Appointment)
    );
  }

  function makeRequest(params: Record<string, string | string[]>): ReturnType<typeof request.get> {
    const qs = new URLSearchParams();
    for (const [key, val] of Object.entries(params)) {
      if (Array.isArray(val)) {
        for (const inner of val) {
          qs.append(key, inner);
        }
      } else {
        qs.append(key, val);
      }
    }
    return request.get('/fhir/R4/Appointment/$find').set('Authorization', `Bearer ${accessToken}`).query(qs.toString());
  }

  // All dates below fall on Mondays: 2026-03-09, -16, -23, -30, 2026-04-06, -13 (all EDT / UTC-4,
  // since US DST began the preceding Sunday, 2026-03-08).

  test('returns a full weekly series when every occurrence is available', async () => {
    const schedule = await makeSchedule(mondayNineToNoon);

    const response = await makeRequest({
      start: new Date('2026-03-09T00:00:00-04:00').toISOString(),
      end: new Date('2026-03-10T00:00:00-04:00').toISOString(),
      'service-type-reference': `HealthcareService/${genericVisit.id}`,
      schedule: `Schedule/${schedule.id}`,
      'occurrence-count': '6',
      _count: '1',
    });

    expect(response).toHaveStatus(200);
    const series = seriesIn(response);
    expect(series).toHaveLength(1);
    const [appointments] = series;
    expect(appointments).toHaveLength(6);

    // All 6 occurrences are weekly, at 9am EDT (13:00 UTC), starting Monday 2026-03-09.
    expect(appointments.map((a) => a.start)).toEqual([
      '2026-03-09T13:00:00.000Z',
      '2026-03-16T13:00:00.000Z',
      '2026-03-23T13:00:00.000Z',
      '2026-03-30T13:00:00.000Z',
      '2026-04-06T13:00:00.000Z',
      '2026-04-13T13:00:00.000Z',
    ]);

    // The nested Bundle is what groups a proposed series; only `$book` tags one.
    expect(appointments.map((appointment) => appointment.identifier)).toEqual(Array(6).fill(undefined));
    expect(appointments.map((appointment) => appointment.extension)).toEqual(Array(6).fill(undefined));
  });

  test('skips a candidate whose later occurrence is unavailable and returns the next valid candidate instead', async () => {
    const schedule = await makeSchedule(mondayNineToNoon);

    // Block the 9am occurrence in week 3 (2026-03-23) only.
    await systemRepo.createResource<Slot>({
      resourceType: 'Slot',
      meta: { project: project.id },
      schedule: createReference(schedule),
      status: 'busy',
      start: '2026-03-23T13:00:00.000Z',
      end: '2026-03-23T14:00:00.000Z',
    });

    const response = await makeRequest({
      start: new Date('2026-03-09T00:00:00-04:00').toISOString(),
      end: new Date('2026-03-10T00:00:00-04:00').toISOString(),
      'service-type-reference': `HealthcareService/${genericVisit.id}`,
      schedule: `Schedule/${schedule.id}`,
      'occurrence-count': '6',
      _count: '1',
    });

    expect(response).toHaveStatus(200);
    const [appointments] = seriesIn(response);
    expect(appointments).toHaveLength(6);

    // The blocked 9am candidate is skipped entirely; the returned series is the 10am candidate instead.
    expect(appointments.map((a) => a.start)).toEqual([
      '2026-03-09T14:00:00.000Z',
      '2026-03-16T14:00:00.000Z',
      '2026-03-23T14:00:00.000Z',
      '2026-03-30T14:00:00.000Z',
      '2026-04-06T14:00:00.000Z',
      '2026-04-13T14:00:00.000Z',
    ]);
    expect(appointments.some((a) => a.start === '2026-03-23T13:00:00.000Z')).toBe(false);
  });

  test('returns an empty bundle when no candidate has availability for every occurrence', async () => {
    const schedule = await makeSchedule(mondayNineToTen);

    // Block the only weekly candidate's occurrence in week 3.
    await systemRepo.createResource<Slot>({
      resourceType: 'Slot',
      meta: { project: project.id },
      schedule: createReference(schedule),
      status: 'busy',
      start: '2026-03-23T13:00:00.000Z',
      end: '2026-03-23T14:00:00.000Z',
    });

    const response = await makeRequest({
      start: new Date('2026-03-09T00:00:00-04:00').toISOString(),
      end: new Date('2026-03-10T00:00:00-04:00').toISOString(),
      'service-type-reference': `HealthcareService/${genericVisit.id}`,
      schedule: `Schedule/${schedule.id}`,
      'occurrence-count': '6',
      _count: '1',
    });

    expect(response).toHaveStatus(200);
    expect(response.body).toMatchObject({ resourceType: 'Bundle', type: 'searchset' });
    expect(response.body).not.toHaveProperty('entry');
  });

  test('excludes a candidate whose later occurrence falls outside the planning horizon, without erroring', async () => {
    // Horizon ends between week 2 (2026-03-16) and week 3 (2026-03-23): the 3rd occurrence's
    // narrow single-day window falls entirely after the horizon, which would otherwise make
    // the underlying $find pipeline throw for that one candidate's forward check.
    const schedule = await makeSchedule(mondayNineToTen, {
      planningHorizon: { end: '2026-03-20T00:00:00Z' },
    });

    const response = await makeRequest({
      start: new Date('2026-03-09T00:00:00-04:00').toISOString(),
      end: new Date('2026-03-10T00:00:00-04:00').toISOString(),
      'service-type-reference': `HealthcareService/${genericVisit.id}`,
      schedule: `Schedule/${schedule.id}`,
      'occurrence-count': '3',
      _count: '1',
    });

    // The only weekly candidate can't complete 3 occurrences within the horizon, so no series
    // is found -- the request itself must still succeed (200, empty), not fail with a 400.
    expect(response).toHaveStatus(200);
    expect(response.body).toMatchObject({ resourceType: 'Bundle', type: 'searchset' });
    expect(response.body).not.toHaveProperty('entry');
  });

  test('preserves local wall-clock time across a DST transition', async () => {
    // 2026-03-02 is EST (UTC-5); DST begins the following Sunday (2026-03-08), so 2026-03-09 is EDT (UTC-4).
    const schedule = await makeSchedule(mondayNineToTen);

    const response = await makeRequest({
      start: new Date('2026-03-02T00:00:00-05:00').toISOString(),
      end: new Date('2026-03-03T00:00:00-05:00').toISOString(),
      'service-type-reference': `HealthcareService/${genericVisit.id}`,
      schedule: `Schedule/${schedule.id}`,
      'occurrence-count': '2',
      _count: '1',
    });

    expect(response).toHaveStatus(200);
    const [appointments] = seriesIn(response);
    expect(appointments.map((a) => a.start)).toEqual([
      '2026-03-02T14:00:00.000Z', // 9am EST
      '2026-03-09T13:00:00.000Z', // 9am EDT -- NOT 14:00:00.000Z (which would be 10am EDT)
    ]);
  });

  test("keeps the schedule's local time across a DST transition when aligned in UTC", async () => {
    const schedule = await makeSchedule(mondayNineToTen, {
      parameters: [{ url: 'alignmentTimezone', valueCode: 'Etc/UTC' }],
    });

    const response = await makeRequest({
      start: new Date('2026-03-02T00:00:00-05:00').toISOString(),
      end: new Date('2026-03-03T00:00:00-05:00').toISOString(),
      'service-type-reference': `HealthcareService/${genericVisit.id}`,
      schedule: `Schedule/${schedule.id}`,
      'occurrence-count': '2',
    });

    expect(response).toHaveStatus(200);
    expect(seriesIn(response).map((occurrences) => occurrences.map((a) => a.start))).toEqual([
      ['2026-03-02T14:00:00.000Z', '2026-03-09T13:00:00.000Z'], // 9am EST, then 9am EDT
    ]);
  });

  test('drops a series whose local time falls off a grid kept in another timezone', async () => {
    // A 90-minute grid in UTC from 00:30, so 14:00 UTC is on it but 13:00 UTC is not.
    const schedule = await makeSchedule(mondayNineToTen, {
      parameters: [
        { url: 'alignmentTimezone', valueCode: 'Etc/UTC' },
        { url: 'alignmentInterval', valueDuration: { value: 90, unit: 'min' } },
        { url: 'alignmentOffset', valueDuration: { value: 30, unit: 'min' } },
      ],
    });

    const response = await makeRequest({
      start: new Date('2026-03-02T00:00:00-05:00').toISOString(),
      end: new Date('2026-03-03T00:00:00-05:00').toISOString(),
      'service-type-reference': `HealthcareService/${genericVisit.id}`,
      schedule: `Schedule/${schedule.id}`,
      'occurrence-count': '2',
    });

    // 9am EST is 14:00 UTC, but 9am EDT the next week is 13:00 UTC.
    expect(response).toHaveStatus(200);
    expect(response.body).not.toHaveProperty('entry');
  });

  test('checks later occurrences at a fine alignment interval', async () => {
    const schedule = await makeSchedule(mondayNineToNoon, {
      parameters: [{ url: 'alignmentInterval', valueDuration: { value: 1, unit: 'min' } }],
    });

    // Week 1 opens at 9:07am; week 2's booking at 9:30am rules out every start up to it.
    await systemRepo.createResource<Slot>({
      resourceType: 'Slot',
      meta: { project: project.id },
      schedule: createReference(schedule),
      status: 'busy',
      start: '2026-03-09T13:00:00.000Z',
      end: '2026-03-09T13:07:00.000Z',
    });
    await systemRepo.createResource<Slot>({
      resourceType: 'Slot',
      meta: { project: project.id },
      schedule: createReference(schedule),
      status: 'busy',
      start: '2026-03-16T13:30:00.000Z',
      end: '2026-03-16T13:31:00.000Z',
    });

    const response = await makeRequest({
      start: new Date('2026-03-09T00:00:00-04:00').toISOString(),
      end: new Date('2026-03-10T00:00:00-04:00').toISOString(),
      'service-type-reference': `HealthcareService/${genericVisit.id}`,
      schedule: `Schedule/${schedule.id}`,
      'occurrence-count': '2',
      _count: '1',
    });

    expect(response).toHaveStatus(200);
    const [appointments] = seriesIn(response);
    expect(appointments.map((a) => a.start)).toEqual(['2026-03-09T13:31:00.000Z', '2026-03-16T13:31:00.000Z']);
  });

  test('keeps a later occurrence that runs past midnight', async () => {
    // Sundays 10pm to 2am, on a half-hour grid.
    const schedule = await makeSchedule(
      {
        url: 'availability',
        extension: [
          {
            url: 'availableTime',
            extension: [
              { url: 'daysOfWeek', valueCode: 'sun' },
              { url: 'availableStartTime', valueTime: '22:00:00' },
              { url: 'availableEndTime', valueTime: '02:00:00' },
            ],
          },
        ],
      },
      { parameters: [{ url: 'alignmentInterval', valueDuration: { value: 30, unit: 'min' } }] }
    );

    const response = await makeRequest({
      start: new Date('2026-03-15T12:00:00-04:00').toISOString(),
      end: new Date('2026-03-16T00:30:00-04:00').toISOString(),
      'service-type-reference': `HealthcareService/${genericVisit.id}`,
      schedule: `Schedule/${schedule.id}`,
      'occurrence-count': '2',
    });

    expect(response).toHaveStatus(200);
    expect(seriesIn(response).map((occurrences) => occurrences.map((a) => a.start))).toEqual([
      ['2026-03-16T02:00:00.000Z', '2026-03-23T02:00:00.000Z'],
      ['2026-03-16T02:30:00.000Z', '2026-03-23T02:30:00.000Z'],
      ['2026-03-16T03:00:00.000Z', '2026-03-23T03:00:00.000Z'],
      // 11:30pm to 12:30am, in both weeks.
      ['2026-03-16T03:30:00.000Z', '2026-03-23T03:30:00.000Z'],
    ]);
  });

  test("searches a later week wide enough for an occurrence's buffers", async () => {
    // Trimmed by its buffers, availability is exactly 9am to 10am.
    const schedule = await makeSchedule(
      {
        url: 'availability',
        extension: [
          {
            url: 'availableTime',
            extension: [
              { url: 'daysOfWeek', valueCode: 'mon' },
              { url: 'availableStartTime', valueTime: '08:45:00' },
              { url: 'availableEndTime', valueTime: '10:15:00' },
            ],
          },
        ],
      },
      {
        parameters: [
          { url: 'bufferBefore', valueDuration: { value: 15, unit: 'min' } },
          { url: 'bufferAfter', valueDuration: { value: 15, unit: 'min' } },
        ],
      }
    );

    const response = await makeRequest({
      start: new Date('2026-03-09T00:00:00-04:00').toISOString(),
      end: new Date('2026-03-10T00:00:00-04:00').toISOString(),
      'service-type-reference': `HealthcareService/${genericVisit.id}`,
      schedule: `Schedule/${schedule.id}`,
      'occurrence-count': '2',
    });

    expect(response).toHaveStatus(200);
    expect(seriesIn(response).map((occurrences) => occurrences.map((a) => a.start))).toEqual([
      ['2026-03-09T13:00:00.000Z', '2026-03-16T13:00:00.000Z'],
    ]);
  });

  test('rejects a series across schedules in different timezones', async () => {
    const pacificPractitioner = await systemRepo.createResource<Practitioner>({
      resourceType: 'Practitioner',
      meta: { project: project.id },
      extension: [{ url: TimezoneExtensionURI, valueCode: 'America/Los_Angeles' }],
    });
    const schedule = await makeSchedule(mondayNineToNoon);
    const pacificSchedule = await makeSchedule(mondayNineToNoon, { actor: pacificPractitioner });

    const response = await makeRequest({
      start: new Date('2026-03-09T00:00:00-04:00').toISOString(),
      end: new Date('2026-03-10T00:00:00-04:00').toISOString(),
      'service-type-reference': `HealthcareService/${genericVisit.id}`,
      schedule: [`Schedule/${schedule.id}`, `Schedule/${pacificSchedule.id}`],
      'occurrence-count': '2',
    });

    expect(response).toHaveStatus(400);
    expect(response.body.issue[0].details.text).toBe('Every schedule in a recurring series must share one timezone');
  });

  test('drops a series whose wall-clock time falls in a DST gap', async () => {
    // Sundays 1am-6am on an hourly grid at a quarter past. DST begins at 2am on Sunday 2026-03-08,
    // so 2:15am doesn't exist that day. Its projection would shift to 3:15am EDT, which is on the
    // grid, but is not the same local time.
    const schedule = await makeSchedule(
      {
        url: 'availability',
        extension: [
          {
            url: 'availableTime',
            extension: [
              { url: 'daysOfWeek', valueCode: 'sun' },
              { url: 'availableStartTime', valueTime: '01:00:00' },
              { url: 'availableEndTime', valueTime: '06:00:00' },
            ],
          },
        ],
      },
      {
        parameters: [
          { url: 'alignmentInterval', valueDuration: { value: 60, unit: 'min' } },
          { url: 'alignmentOffset', valueDuration: { value: 15, unit: 'min' } },
        ],
      }
    );

    const response = await makeRequest({
      start: new Date('2026-03-01T00:00:00-05:00').toISOString(),
      end: new Date('2026-03-02T00:00:00-05:00').toISOString(),
      'service-type-reference': `HealthcareService/${genericVisit.id}`,
      schedule: `Schedule/${schedule.id}`,
      'occurrence-count': '2',
    });

    expect(response).toHaveStatus(200);
    expect(seriesIn(response).map((occurrences) => occurrences.map((a) => a.start))).toEqual([
      ['2026-03-01T06:15:00.000Z', '2026-03-08T06:15:00.000Z'], // 1:15am EST, both weeks
      ['2026-03-01T08:15:00.000Z', '2026-03-08T07:15:00.000Z'], // 3:15am EST, then 3:15am EDT
      ['2026-03-01T09:15:00.000Z', '2026-03-08T08:15:00.000Z'],
    ]);
  });

  test('with slotCapacity > 1, a later occurrence is still refused by its exclusive buffer', async () => {
    // bufferBefore trims the 9am candidate out of every week, leaving 10am and 11am.
    const schedule = await makeSchedule(mondayNineToNoon, {
      parameters: [
        { url: 'slotCapacity', valuePositiveInt: 2 },
        { url: 'bufferBefore', valueDuration: { value: 20, unit: 'min' } },
      ],
    });

    // A capacity-2 booking at 9am in week 2 leaves room to overlap it, but 10am's buffer
    // (9:40-10am) lands on it, and buffer time cannot be overbooked.
    await systemRepo.createResource<Slot>({
      resourceType: 'Slot',
      meta: { project: project.id },
      schedule: createReference(schedule),
      status: 'busy',
      start: '2026-03-16T13:00:00.000Z',
      end: '2026-03-16T14:00:00.000Z',
      extension: [{ url: SchedulingSlotCapacityURI, valuePositiveInt: 2 }],
    });

    const response = await makeRequest({
      start: new Date('2026-03-09T00:00:00-04:00').toISOString(),
      end: new Date('2026-03-10T00:00:00-04:00').toISOString(),
      'service-type-reference': `HealthcareService/${genericVisit.id}`,
      schedule: `Schedule/${schedule.id}`,
      'occurrence-count': '2',
      _count: '1',
    });

    expect(response).toHaveStatus(200);
    const [appointments] = seriesIn(response);
    expect(appointments.map((a) => a.start)).toEqual(['2026-03-09T15:00:00.000Z', '2026-03-16T15:00:00.000Z']);
  });

  test('_count limits the number of series returned, in chronological candidate order', async () => {
    const schedule = await makeSchedule(mondayNineToNoon);

    const response = await makeRequest({
      start: new Date('2026-03-09T00:00:00-04:00').toISOString(),
      end: new Date('2026-03-10T00:00:00-04:00').toISOString(),
      'service-type-reference': `HealthcareService/${genericVisit.id}`,
      schedule: `Schedule/${schedule.id}`,
      'occurrence-count': '2',
      _count: '2',
    });

    expect(response).toHaveStatus(200);
    const series = seriesIn(response);
    // 2 series of 2 occurrences each; the 11am candidate is excluded by _count.
    expect(series.map((occurrences) => occurrences.map((a) => a.start))).toEqual([
      ['2026-03-09T13:00:00.000Z', '2026-03-16T13:00:00.000Z'],
      ['2026-03-09T14:00:00.000Z', '2026-03-16T14:00:00.000Z'],
    ]);
  });

  test('accepts one local week that runs an hour longer across a DST transition', async () => {
    const schedule = await makeSchedule(mondayNineToTen);

    // Clocks fall back on Sunday 2026-11-01, so this week is 169 hours long.
    const response = await makeRequest({
      start: new Date('2026-10-26T00:00:00-04:00').toISOString(),
      end: new Date('2026-11-02T00:00:00-05:00').toISOString(),
      'service-type-reference': `HealthcareService/${genericVisit.id}`,
      schedule: `Schedule/${schedule.id}`,
      'occurrence-count': '2',
    });

    expect(response).toHaveStatus(200);
    expect(seriesIn(response).map((occurrences) => occurrences.map((a) => a.start))).toEqual([
      ['2026-10-26T13:00:00.000Z', '2026-11-02T14:00:00.000Z'], // 9am EDT, then 9am EST
    ]);
  });

  test('rejects a search range wider than one week', async () => {
    const schedule = await makeSchedule(mondayNineToNoon);

    const response = await makeRequest({
      start: new Date('2026-03-09T00:00:00-04:00').toISOString(),
      end: new Date('2026-03-17T00:00:00-04:00').toISOString(), // 8 days
      'service-type-reference': `HealthcareService/${genericVisit.id}`,
      schedule: `Schedule/${schedule.id}`,
      'occurrence-count': '2',
    });

    expect(response).toHaveStatus(400);
    expect(response.body.issue[0].details.text).toBe('Search range cannot exceed 7 days');
  });

  test.each([0, 7])('rejects an out-of-range occurrence-count of %i', async (occurrenceCount) => {
    const schedule = await makeSchedule(mondayNineToNoon);

    const response = await makeRequest({
      start: new Date('2026-03-09T00:00:00-04:00').toISOString(),
      end: new Date('2026-03-10T00:00:00-04:00').toISOString(),
      'service-type-reference': `HealthcareService/${genericVisit.id}`,
      schedule: `Schedule/${schedule.id}`,
      'occurrence-count': String(occurrenceCount),
    });

    expect(response).toHaveStatus(400);
    expect(response.body.issue[0].details.text).toMatch(/occurrence-count/);
  });

  test('an occurrence-count of 1 searches for a single time', async () => {
    const schedule = await makeSchedule(mondayNineToNoon);

    const response = await makeRequest({
      start: new Date('2026-03-09T00:00:00-04:00').toISOString(),
      end: new Date('2026-03-10T00:00:00-04:00').toISOString(),
      'service-type-reference': `HealthcareService/${genericVisit.id}`,
      schedule: `Schedule/${schedule.id}`,
      'occurrence-count': '1',
    });

    expect(response).toHaveStatus(200);
    const appointments = ((response.body as Bundle<Appointment>).entry ?? []).map((e) => e.resource as Appointment);
    expect(appointments.map((a) => a.start)).toEqual([
      '2026-03-09T13:00:00.000Z',
      '2026-03-09T14:00:00.000Z',
      '2026-03-09T15:00:00.000Z',
    ]);
    // Each entry is an Appointment of its own, not a nested series.
    expect(appointments.map((appointment) => appointment.resourceType)).toEqual([
      'Appointment',
      'Appointment',
      'Appointment',
    ]);
  });

  test('rejects ignore-appointment combined with occurrence-count', async () => {
    const schedule = await makeSchedule(mondayNineToNoon);

    const response = await makeRequest({
      start: new Date('2026-03-09T00:00:00-04:00').toISOString(),
      end: new Date('2026-03-10T00:00:00-04:00').toISOString(),
      'service-type-reference': `HealthcareService/${genericVisit.id}`,
      schedule: `Schedule/${schedule.id}`,
      'occurrence-count': '2',
      'ignore-appointment': 'Appointment/123',
    });

    expect(response).toHaveStatus(400);
    expect(response.body.issue[0].details.text).toBe('ignore-appointment cannot be combined with occurrence-count');
  });
});
