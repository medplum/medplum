// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { DayOfWeek, WithId } from '@medplum/core';
import {
  createReference,
  DEFAULT_MAX_SEARCH_COUNT,
  RecurrenceTemplateExtensionURI,
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
import { vi } from 'vitest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import type { SystemRepository } from '../../fhir/repo';
import { Repository } from '../../fhir/repo';
import { createTestProject } from '../../test.setup';
import type { SchedulingParametersExtensionExtension } from './utils/scheduling-parameters';

const app = express();
const request = supertest(app);

type Time = `${number}:${number}:${number}`;

function availableOn(day: DayOfWeek, start: Time, end: Time): SchedulingParametersExtensionExtension {
  return {
    url: 'availability',
    extension: [
      {
        url: 'availableTime',
        extension: [
          { url: 'daysOfWeek', valueCode: day },
          { url: 'availableStartTime', valueTime: start },
          { url: 'availableEndTime', valueTime: end },
        ],
      },
    ],
  };
}

// Schedules are in America/New_York, with a 60-minute visit on an hourly grid in that timezone.
// Unless noted, dates are Mondays after US DST began on Sunday 2026-03-08, so EDT (UTC-4).
describe('Appointment/$find with occurrence-count', () => {
  let practitioner: WithId<Practitioner>;
  let visit: WithId<HealthcareService>;
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
    visit = await systemRepo.createResource<HealthcareService>({
      resourceType: 'HealthcareService',
      meta: { project: project.id },
      type: [{ coding: [{ system: 'https://example.com', code: 'recurring-visit' }] }],
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [
            { url: 'duration', valueDuration: { value: 60, unit: 'min' } },
            { url: 'alignmentTimezone', valueCode: 'America/New_York' },
          ],
        },
      ],
      name: 'Recurring Visit',
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  async function makeSchedule(
    availability: SchedulingParametersExtensionExtension,
    opts?: { parameters?: Extension[]; planningHorizon?: Schedule['planningHorizon']; actor?: Practitioner }
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
            { url: 'service', valueReference: createReference(visit) },
            ...(opts?.parameters ?? []),
          ],
        },
      ],
      serviceType: toServiceTypeCodeableConcepts(visit),
      planningHorizon: opts?.planningHorizon,
    });
  }

  async function makeBusySlot(
    schedule: WithId<Schedule>,
    start: string,
    end: string,
    capacity?: number
  ): Promise<void> {
    await systemRepo.createResource<Slot>({
      resourceType: 'Slot',
      meta: { project: project.id },
      schedule: createReference(schedule),
      status: 'busy',
      start,
      end,
      extension: capacity ? [{ url: SchedulingSlotCapacityURI, valuePositiveInt: capacity }] : undefined,
    });
  }

  function find(
    schedule: WithId<Schedule> | WithId<Schedule>[],
    params: Record<string, string>
  ): ReturnType<typeof request.get> {
    const qs = new URLSearchParams({ 'service-type-reference': `HealthcareService/${visit.id}`, ...params });
    for (const s of Array.isArray(schedule) ? schedule : [schedule]) {
      qs.append('schedule', `Schedule/${s.id}`);
    }
    return request.get('/fhir/R4/Appointment/$find').set('Authorization', `Bearer ${accessToken}`).query(qs.toString());
  }

  function appointments(response: { body: unknown }): Appointment[] {
    return ((response.body as Bundle<Appointment>).entry ?? []).map((entry) => entry.resource as Appointment);
  }

  function starts(response: { body: unknown }): (string | undefined)[] {
    return appointments(response).map((appointment) => appointment.start);
  }

  const monday = {
    start: new Date('2026-03-09T00:00:00-04:00').toISOString(),
    end: new Date('2026-03-10T00:00:00-04:00').toISOString(),
  };

  test('finds times that are free at the same time every week', async () => {
    const schedule = await makeSchedule(availableOn('mon', '09:00:00', '12:00:00'));
    // 9am is booked in week 3, and 10am in week 4, which is past a 3-week series.
    await makeBusySlot(schedule, '2026-03-23T13:00:00.000Z', '2026-03-23T14:00:00.000Z');
    await makeBusySlot(schedule, '2026-03-30T14:00:00.000Z', '2026-03-30T15:00:00.000Z');

    const single = await find(schedule, monday);
    expect(single).toHaveStatus(200);
    expect(starts(single)).toEqual([
      '2026-03-09T13:00:00.000Z',
      '2026-03-09T14:00:00.000Z',
      '2026-03-09T15:00:00.000Z',
    ]);
    expect(appointments(single).map((appointment) => appointment.extension)).toEqual([undefined, undefined, undefined]);

    const series = await find(schedule, { ...monday, 'occurrence-count': '3' });
    expect(series).toHaveStatus(200);
    expect(starts(series)).toEqual(['2026-03-09T14:00:00.000Z', '2026-03-09T15:00:00.000Z']);

    // Each entry is the series' first occurrence, holding only its own Slot, and says how it recurs.
    const [first] = appointments(series);
    expect(first.contained).toEqual([
      expect.objectContaining({ resourceType: 'Slot', status: 'busy', start: '2026-03-09T14:00:00.000Z' }),
    ]);
    expect(first.extension).toEqual([
      {
        url: RecurrenceTemplateExtensionURI,
        extension: [
          {
            url: 'timezone',
            valueCodeableConcept: { coding: [{ system: 'https://www.iana.org/time-zones', code: 'America/New_York' }] },
          },
          {
            url: 'recurrenceType',
            valueCodeableConcept: { coding: [{ system: 'http://unitsofmeasure.org', code: 'wk', display: 'week' }] },
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
      },
    ]);

    // `_count` counts series, so the 9am time that isn't one doesn't use up the page.
    const firstOnly = await find(schedule, { ...monday, 'occurrence-count': '3', _count: '1' });
    expect(firstOnly).toHaveStatus(200);
    expect(starts(firstOnly)).toEqual(['2026-03-09T14:00:00.000Z']);
  });

  test('keeps each occurrence at the same local time across DST transitions', async () => {
    // Sundays 1am-6am, at a quarter past each hour. DST begins at 2am on Sunday 2026-03-08.
    const sunday = await makeSchedule(availableOn('sun', '01:00:00', '06:00:00'), {
      parameters: [{ url: 'alignmentOffset', valueDuration: { value: 15, unit: 'min' } }],
    });
    // 4:15am EDT on 03-08: where 4:15am EST projects to, and where 3:15am EST would land if it
    // were projected by 7x24 hours rather than by local time.
    await makeBusySlot(sunday, '2026-03-08T08:15:00.000Z', '2026-03-08T09:15:00.000Z');

    const springForward = await find(sunday, {
      start: new Date('2026-03-01T00:00:00-05:00').toISOString(),
      end: new Date('2026-03-02T00:00:00-05:00').toISOString(),
      'occurrence-count': '2',
    });
    expect(springForward).toHaveStatus(200);
    // 1:15am and 3:15am EST. 2:15am doesn't exist on 03-08, and 4:15am is booked.
    expect(starts(springForward)).toEqual(['2026-03-01T06:15:00.000Z', '2026-03-01T08:15:00.000Z']);

    // Clocks fall back on Sunday 2026-11-01, so 9am the next Monday is an hour later in UTC than
    // the requested hour, 7x24 hours on.
    const mondayMorning = await makeSchedule(availableOn('mon', '09:00:00', '10:00:00'));
    const fallBack = await find(mondayMorning, {
      start: '2026-10-26T13:00:00.000Z',
      end: '2026-10-26T14:00:00.000Z',
      'occurrence-count': '2',
    });
    expect(fallBack).toHaveStatus(200);
    expect(starts(fallBack)).toEqual(['2026-10-26T13:00:00.000Z']);
  });

  test('drops a series whose later occurrences fall off an alignment grid kept in UTC', async () => {
    // A grid every 2 hours from UTC midnight. 9am EST (14:00 UTC) is on it, but 9am EDT the next
    // week (13:00 UTC) is not.
    const schedule = await makeSchedule(availableOn('mon', '09:00:00', '10:00:00'), {
      parameters: [
        { url: 'alignmentTimezone', valueCode: 'Etc/UTC' },
        { url: 'alignmentInterval', valueDuration: { value: 120, unit: 'min' } },
      ],
    });
    const estMonday = {
      start: new Date('2026-03-02T00:00:00-05:00').toISOString(),
      end: new Date('2026-03-03T00:00:00-05:00').toISOString(),
    };

    expect(starts(await find(schedule, estMonday))).toEqual(['2026-03-02T14:00:00.000Z']);

    const series = await find(schedule, { ...estMonday, 'occurrence-count': '2' });
    expect(series).toHaveStatus(200);
    expect(starts(series)).toEqual([]);
  });

  test('finds no series that runs past the planning horizon', async () => {
    const schedule = await makeSchedule(availableOn('mon', '09:00:00', '10:00:00'), {
      planningHorizon: { end: '2026-03-20T00:00:00.000Z' },
    });

    expect(starts(await find(schedule, { ...monday, 'occurrence-count': '2' }))).toEqual(['2026-03-09T13:00:00.000Z']);

    const pastHorizon = await find(schedule, { ...monday, 'occurrence-count': '3' });
    expect(pastHorizon).toHaveStatus(200);
    expect(starts(pastHorizon)).toEqual([]);
  });

  test("checks a later occurrence's buffer, which can't be overbooked", async () => {
    // bufferBefore rules out 9am every week, leaving 10am and 11am.
    const schedule = await makeSchedule(availableOn('mon', '09:00:00', '12:00:00'), {
      parameters: [
        { url: 'slotCapacity', valuePositiveInt: 2 },
        { url: 'bufferBefore', valueDuration: { value: 20, unit: 'min' } },
      ],
    });
    // Booked at capacity 2 in week 2, so 10am may overlap this booking, but its buffer (9:40-10am)
    // may not. Without the capacity, the booking alone would rule out 10am.
    await makeBusySlot(schedule, '2026-03-16T13:00:00.000Z', '2026-03-16T14:00:00.000Z', 2);

    const response = await find(schedule, { ...monday, 'occurrence-count': '2' });
    expect(response).toHaveStatus(200);
    expect(starts(response)).toEqual(['2026-03-09T15:00:00.000Z']);
  });

  test('names the later week whose Slots fill a search page', async () => {
    const schedule = await makeSchedule(availableOn('mon', '09:00:00', '10:00:00'));

    // The 3rd occurrence's week: the requested Monday, two weeks on, widened an hour each side.
    const originalSearch = Repository.prototype.searchResources;
    const searchSpy = vi.spyOn(Repository.prototype, 'searchResources').mockImplementation(async function (
      this: Repository,
      searchRequest
    ) {
      const after = searchRequest.filters?.find((filter) => filter.code === 'end')?.value;
      if (searchRequest.resourceType === 'Slot' && after === '2026-03-23T03:00:00.000Z') {
        return Array.from({ length: DEFAULT_MAX_SEARCH_COUNT }, () => ({}) as WithId<Slot>);
      }
      return originalSearch.call(this, searchRequest);
    });

    try {
      const response = await find(schedule, { ...monday, 'occurrence-count': '3' });
      expect(response).toHaveStatus(400);
      expect(response.body.issue[0].details.text).toBe(
        'Too many slots found for occurrence 3, between 2026-03-23T03:00:00.000Z and 2026-03-24T05:00:00.000Z; try searching with smaller bounds'
      );
    } finally {
      searchSpy.mockRestore();
    }
  });

  test('validates recurring searches', async () => {
    const schedule = await makeSchedule(availableOn('mon', '00:00:00', '01:00:00'));

    // One local week, which runs 169 hours as clocks fall back on 2026-11-01. It offers only its
    // own Monday midnight, not the next one, where it ends.
    const localWeek = await find(schedule, {
      start: new Date('2026-10-26T00:00:00-04:00').toISOString(),
      end: new Date('2026-11-02T00:00:00-05:00').toISOString(),
      'occurrence-count': '2',
    });
    expect(localWeek).toHaveStatus(200);
    expect(starts(localWeek)).toEqual(['2026-10-26T04:00:00.000Z']);

    const eightDays = await find(schedule, {
      start: monday.start,
      end: new Date('2026-03-17T00:00:00-04:00').toISOString(),
      'occurrence-count': '2',
    });
    expect(eightDays).toHaveStatus(400);
    expect(eightDays.body.issue[0].details.text).toBe('Search range cannot exceed 7 days');

    for (const occurrenceCount of ['0', '1', '7']) {
      const response = await find(schedule, { ...monday, 'occurrence-count': occurrenceCount });
      expect(response).toHaveStatus(400);
      expect(response.body.issue[0].details.text).toBe('Invalid occurrence-count, must be between 2 and 6');
    }

    const withIgnore = await find(schedule, {
      ...monday,
      'occurrence-count': '2',
      'ignore-appointment': 'Appointment/123',
    });
    expect(withIgnore).toHaveStatus(400);
    expect(withIgnore.body.issue[0].details.text).toBe('ignore-appointment cannot be combined with occurrence-count');

    const pacificPractitioner = await systemRepo.createResource<Practitioner>({
      resourceType: 'Practitioner',
      meta: { project: project.id },
      extension: [{ url: TimezoneExtensionURI, valueCode: 'America/Los_Angeles' }],
    });
    const pacificSchedule = await makeSchedule(availableOn('mon', '09:00:00', '10:00:00'), {
      actor: pacificPractitioner,
    });
    const mixedTimezones = await find([schedule, pacificSchedule], { ...monday, 'occurrence-count': '2' });
    expect(mixedTimezones).toHaveStatus(400);
    expect(mixedTimezones.body.issue[0].details.text).toBe(
      'All schedules must share one timezone to find a recurring series'
    );
  });
});
