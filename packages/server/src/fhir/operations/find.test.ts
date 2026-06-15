// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { ContentType, createReference } from '@medplum/core';
import type {
  Appointment,
  Bundle,
  Extension,
  HealthcareService,
  Location,
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
import { ServiceTypeReferenceURI, toCodeableReferenceLike } from '../../util/servicetype';
import type { SchedulingParametersExtensionExtension } from './utils/scheduling-parameters';

const app = express();
const request = supertest(app);

type AvailabilityOptions = {
  service: WithId<HealthcareService>;
  bufferBefore?: number;
  bufferAfter?: number;
  alignmentInterval?: number;
  alignmentOffset?: number;
  duration?: number;
  availability: SchedulingParametersExtensionExtension;
  timezone?: string;
  alignmentTimezone?: string;
};

const fourDayWorkWeek = {
  url: 'availability',
  extension: [
    {
      url: 'availableTime',
      extension: [
        { url: 'daysOfWeek', valueCode: 'mon' },
        { url: 'daysOfWeek', valueCode: 'tue' },
        { url: 'daysOfWeek', valueCode: 'wed' },
        { url: 'daysOfWeek', valueCode: 'thu' },
        { url: 'availableStartTime', valueTime: '09:30:00' },
        { url: 'availableEndTime', valueTime: '12:30:00' },
      ],
    },
    {
      url: 'availableTime',
      extension: [
        { url: 'daysOfWeek', valueCode: 'mon' },
        { url: 'daysOfWeek', valueCode: 'tue' },
        { url: 'daysOfWeek', valueCode: 'wed' },
        { url: 'daysOfWeek', valueCode: 'thu' },
        { url: 'availableStartTime', valueTime: '13:15:00' },
        { url: 'availableEndTime', valueTime: '16:15:00' },
      ],
    },
  ],
} satisfies SchedulingParametersExtensionExtension;

const twoDaySchedule = {
  url: 'availability',
  extension: [
    {
      url: 'availableTime',
      extension: [
        { url: 'daysOfWeek', valueCode: 'thu' },
        { url: 'daysOfWeek', valueCode: 'fri' },
        { url: 'availableStartTime', valueTime: '12:00:00' },
        { url: 'availableEndTime', valueTime: '20:00:00' },
      ],
    },
  ],
} satisfies SchedulingParametersExtensionExtension;

const fridayOnly = {
  url: 'availability',
  extension: [
    {
      url: 'availableTime',
      extension: [
        { url: 'daysOfWeek', valueCode: 'fri' },
        { url: 'availableStartTime', valueTime: '10:30:00' },
        { url: 'availableEndTime', valueTime: '18:30:00' },
      ],
    },
  ],
} satisfies SchedulingParametersExtensionExtension;

const monTueAvailability = {
  url: 'availability',
  extension: [
    {
      url: 'availableTime',
      extension: [
        { url: 'daysOfWeek', valueCode: 'mon' },
        { url: 'daysOfWeek', valueCode: 'tue' },
        { url: 'availableStartTime', valueTime: '09:00:00' },
        { url: 'availableEndTime', valueTime: '17:00:00' },
      ],
    },
  ],
} satisfies SchedulingParametersExtensionExtension;

const tueWedAvailability = {
  url: 'availability',
  extension: [
    {
      url: 'availableTime',
      extension: [
        { url: 'daysOfWeek', valueCode: 'tue' },
        { url: 'daysOfWeek', valueCode: 'wed' },
        { url: 'availableStartTime', valueTime: '13:00:00' },
        { url: 'availableEndTime', valueTime: '18:00:00' },
      ],
    },
  ],
} satisfies SchedulingParametersExtensionExtension;

describe('Appointment/$find', () => {
  let location: Location;
  let practitioner: Practitioner;
  let officeVisit: WithId<HealthcareService>;
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
      extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/timezone', valueCode: 'America/New_York' }],
    });
    location = await systemRepo.createResource<Location>({
      resourceType: 'Location',
      meta: { project: project.id },
      extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/timezone', valueCode: 'America/New_York' }],
    });
    genericVisit = await systemRepo.createResource<HealthcareService>({
      resourceType: 'HealthcareService',
      meta: { project: project.id },
      type: [{ coding: [{ system: 'http://example.com', code: 'generic-visit' }] }],
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [
            {
              url: 'duration',
              valueDuration: { value: 20, unit: 'min' },
            },
            {
              url: 'alignmentTimezone',
              valueCode: 'America/Chicago',
            },
          ],
        },
      ],
      name: 'Visit',
    });
    officeVisit = await systemRepo.createResource<HealthcareService>({
      resourceType: 'HealthcareService',
      meta: { project: project.id },
      type: [{ coding: [{ code: 'office-visit' }] }],
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [
            {
              url: 'duration',
              valueDuration: { value: 20, unit: 'min' },
            },
          ],
        },
      ],
      name: 'Office Visit',
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  function makeSchedulingExtension(availability: AvailabilityOptions[]): Extension[] {
    return availability.map((options) => {
      const { availability, timezone, alignmentTimezone, service, ...durations } = options;

      const extension = {
        url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
        extension: [] as Extension[],
      } satisfies Extension;

      if (availability) {
        extension.extension.push(availability);
      }

      if (timezone) {
        extension.extension.push({
          url: 'timezone',
          valueCode: timezone,
        });
      }

      if (alignmentTimezone) {
        extension.extension.push({
          url: 'alignmentTimezone',
          valueCode: alignmentTimezone,
        });
      }

      extension.extension.push({
        url: 'service',
        valueReference: createReference(service),
      });

      Object.entries(durations).forEach(([key, value]) =>
        extension.extension.push({ url: key, valueDuration: { value, unit: 'min' } })
      );

      return extension;
    });
  }

  async function makeSchedule(
    availability: AvailabilityOptions[],
    opts?: { actor?: Schedule['actor']; planningHorizon?: Schedule['planningHorizon'] }
  ): Promise<Schedule> {
    const serviceType = availability.flatMap((entry) => toCodeableReferenceLike(entry.service));
    return systemRepo.createResource<Schedule>({
      resourceType: 'Schedule',
      meta: { project: project.id },
      actor: opts?.actor ?? [createReference(practitioner)],
      extension: makeSchedulingExtension(availability),
      serviceType,
      planningHorizon: opts?.planningHorizon,
    });
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

  test('finds appointments that are available on all referenced schedules', async () => {
    // Mon,Tue, 9a-5p availability
    const practitionerSchedule = await makeSchedule(
      [
        {
          service: genericVisit,
          duration: 30,
          availability: monTueAvailability,
        },
      ],
      { actor: [createReference(practitioner)] }
    );

    // Tue,Wed, 1p-6p availability
    const locationSchedule = await makeSchedule(
      [
        {
          service: genericVisit,
          duration: 30,
          availability: tueWedAvailability,
        },
      ],
      { actor: [createReference(location)] }
    );

    const response = await makeRequest({
      start: new Date('2026-03-16T00:00:00-05:00').toISOString(),
      end: new Date('2026-03-21T00:00:00-05:00').toISOString(),
      'service-type-reference': `HealthcareService/${genericVisit.id}`,
      schedule: [`Schedule/${practitionerSchedule.id}`, `Schedule/${locationSchedule.id}`],
    });

    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toBe(200);

    expect(response.body).toMatchObject({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: expect.arrayOf(expect.any(Object)),
    });

    (response.body as Bundle<Appointment>).entry?.forEach((entry) => {
      expect(entry).toMatchObject({
        resource: {
          resourceType: 'Appointment',
          status: 'proposed',
          start: expect.any(String),
          end: expect.any(String),
          serviceType: [{ coding: [{ code: 'generic-visit' }] }],
          participant: [
            {
              actor: { reference: `Practitioner/${practitioner.id}` },
              required: 'required',
              status: 'needs-action',
            },
            {
              actor: { reference: `Location/${location.id}` },
              required: 'required',
              status: 'needs-action',
            },
          ],
        },
      });
    });

    // Overlap is Tue, 1p-5p EDT
    expect((response.body as Bundle<Appointment>).entry?.map((entry) => entry.resource?.start)).toEqual([
      '2026-03-17T17:00:00.000Z', // 5pm UTC, 1pm EDT
      '2026-03-17T18:00:00.000Z', // 6pm UTC, 2pm EDT
      '2026-03-17T19:00:00.000Z', // 7pm UTC, 3pm EDT
      '2026-03-17T20:00:00.000Z', // 8pm UTC, 4pm EDT
    ]);
  });

  test('works with a single schedule', async () => {
    // Mon,Tue, 9a-5p availability
    const practitionerSchedule = await makeSchedule([
      {
        service: genericVisit,
        duration: 30,
        availability: monTueAvailability,
      },
    ]);

    const response = await makeRequest({
      start: new Date('2026-03-16T00:00:00-05:00').toISOString(),
      end: new Date('2026-03-21T00:00:00-05:00').toISOString(),
      'service-type-reference': `HealthcareService/${genericVisit.id}`,
      schedule: `Schedule/${practitionerSchedule.id}`,
    });

    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toBe(200);

    (response.body as Bundle<Appointment>).entry?.forEach((entry) => {
      expect(entry).toMatchObject({
        resource: {
          resourceType: 'Appointment',
          status: 'proposed',
          start: expect.any(String),
          end: expect.any(String),
          serviceType: [{ coding: [{ code: 'generic-visit' }] }],
          participant: [
            {
              actor: { reference: `Practitioner/${practitioner.id}` },
              required: 'required',
              status: 'needs-action',
            },
          ],
        },
      });
    });

    expect((response.body as Bundle<Appointment>).entry?.map((entry) => entry.resource?.start)).toEqual([
      // Tuesday
      '2026-03-16T13:00:00.000Z', // 1pm UTC, 9am EDT
      '2026-03-16T14:00:00.000Z', // 2pm UTC, 10am EDT
      '2026-03-16T15:00:00.000Z', // 3pm UTC, 11am EDT
      '2026-03-16T16:00:00.000Z', // 4pm UTC, 12pm EDT
      '2026-03-16T17:00:00.000Z', // 5pm UTC, 1pm EDT
      '2026-03-16T18:00:00.000Z', // 6pm UTC, 2pm EDT
      '2026-03-16T19:00:00.000Z', // 7pm UTC, 3pm EDT
      '2026-03-16T20:00:00.000Z', // 8pm UTC, 4pm EDT

      // Wednesday
      '2026-03-17T13:00:00.000Z', // 1pm UTC, 9am EDT
      '2026-03-17T14:00:00.000Z', // 2pm UTC, 10am EDT
      '2026-03-17T15:00:00.000Z', // 3pm UTC, 11am EDT
      '2026-03-17T16:00:00.000Z', // 4pm UTC, 12pm EDT
      '2026-03-17T17:00:00.000Z', // 5pm UTC, 1pm EDT
      '2026-03-17T18:00:00.000Z', // 6pm UTC, 2pm EDT
      '2026-03-17T19:00:00.000Z', // 7pm UTC, 3pm EDT
      '2026-03-17T20:00:00.000Z', // 8pm UTC, 4pm EDT
    ]);
  });

  test('no overlapping availability returns empty bundle', async () => {
    // Schedule A: Monday+Tuesday only; Schedule B: Friday only — no shared days
    const scheduleA = await makeSchedule(
      [
        {
          service: genericVisit,
          duration: 60,
          availability: monTueAvailability,
        },
      ],
      { actor: [createReference(practitioner)] }
    );

    const scheduleB = await makeSchedule(
      [
        {
          service: genericVisit,
          duration: 60,
          availability: fridayOnly,
        },
      ],
      { actor: [createReference(location)] }
    );

    const response = await makeRequest({
      start: new Date('2026-03-16T00:00:00-04:00').toISOString(),
      end: new Date('2026-03-21T00:00:00-04:00').toISOString(),
      'service-type-reference': `HealthcareService/${genericVisit.id}`,
      schedule: [`Schedule/${scheduleA.id}`, `Schedule/${scheduleB.id}`],
    });

    expect(response.status).toBe(200);
    expect(response.body).not.toHaveProperty('issue');
    expect(response.body).toMatchObject({ resourceType: 'Bundle', type: 'searchset' });
    expect(response.body).not.toHaveProperty('entry');
  });

  test(`merges "free" slots on each schedule into that schedule's availability`, async () => {
    // Schedule A (practitioner): Mon-Tue 9am-5pm, 60min
    const scheduleA = await makeSchedule(
      [
        {
          service: genericVisit,
          duration: 60,
          availability: monTueAvailability,
        },
      ],
      { actor: [createReference(practitioner)] }
    );

    // Schedule B (location): Tue-Wed 1pm-6pm, 60min — overlap is Tue 1pm-5pm
    const scheduleB = await makeSchedule(
      [
        {
          service: genericVisit,
          duration: 60,
          availability: tueWedAvailability,
        },
      ],
      { actor: [createReference(location)] }
    );

    // Mark Tue 5pm-6pm EDT free on Schedule A — overlap is now Tue 1pm-6pm
    await systemRepo.createResource<Slot>({
      resourceType: 'Slot',
      meta: { project: project.id },
      schedule: createReference(scheduleA),
      status: 'free',
      start: new Date('2026-03-17T17:00:00-04:00').toISOString(),
      end: new Date('2026-03-17T18:00:00-04:00').toISOString(),
    });

    const response = await makeRequest({
      start: new Date('2026-03-16T00:00:00-04:00').toISOString(),
      end: new Date('2026-03-18T00:00:00-04:00').toISOString(),
      'service-type-reference': `HealthcareService/${genericVisit.id}`,
      schedule: [`Schedule/${scheduleA.id}`, `Schedule/${scheduleB.id}`],
    });

    expect(response.status).toBe(200);
    const starts = (response.body as Bundle<Appointment>).entry?.map((e) => e.resource?.start) ?? [];
    expect(starts).toEqual([
      new Date('2026-03-17T13:00:00-04:00').toISOString(),
      new Date('2026-03-17T14:00:00-04:00').toISOString(),
      new Date('2026-03-17T15:00:00-04:00').toISOString(),
      new Date('2026-03-17T16:00:00-04:00').toISOString(),
      new Date('2026-03-17T17:00:00-04:00').toISOString(),
    ]);
  });

  test('busy slot on second schedule removes that interval from results', async () => {
    // Schedule A (practitioner): Mon-Tue 9am-5pm, 60min
    const scheduleA = await makeSchedule(
      [
        {
          service: genericVisit,
          duration: 60,
          availability: monTueAvailability,
        },
      ],
      { actor: [createReference(practitioner)] }
    );

    // Schedule B (location): Tue-Wed 1pm-6pm, 60min — overlap is Tue 1pm-5pm
    const scheduleB = await makeSchedule(
      [
        {
          service: genericVisit,
          duration: 60,
          availability: tueWedAvailability,
        },
      ],
      { actor: [createReference(location)] }
    );

    // Mark Tue 2pm-3pm EDT busy on Schedule B
    await systemRepo.createResource<Slot>({
      resourceType: 'Slot',
      meta: { project: project.id },
      schedule: createReference(scheduleB),
      status: 'busy',
      start: new Date('2026-03-17T14:00:00-04:00').toISOString(),
      end: new Date('2026-03-17T15:00:00-04:00').toISOString(),
    });

    const response = await makeRequest({
      start: new Date('2026-03-16T00:00:00-04:00').toISOString(),
      end: new Date('2026-03-18T00:00:00-04:00').toISOString(),
      'service-type-reference': `HealthcareService/${genericVisit.id}`,
      schedule: [`Schedule/${scheduleA.id}`, `Schedule/${scheduleB.id}`],
    });

    expect(response.status).toBe(200);
    const starts = (response.body as Bundle<Appointment>).entry?.map((e) => e.resource?.start) ?? [];
    expect(starts).toContain(new Date('2026-03-17T13:00:00-04:00').toISOString()); // 1pm EDT — ok
    expect(starts).not.toContain(new Date('2026-03-17T14:00:00-04:00').toISOString()); // 2pm EDT — blocked
    expect(starts).toContain(new Date('2026-03-17T15:00:00-04:00').toISOString()); // 3pm EDT — ok
    expect(starts).toContain(new Date('2026-03-17T16:00:00-04:00').toISOString()); // 4pm EDT — ok
  });

  test('each schedule can have its own timezone set in scheduling parameters', async () => {
    // Both actors have America/New_York timezone, but scheduling params override per-schedule.
    // Schedule A (practitioner): America/Phoenix (always UTC-7) — Mon 9am-5pm = 16:00-00:00 UTC
    // Schedule B (location):     Pacific/Honolulu (always UTC-10) — Mon 9am-5pm = 19:00-03:00 UTC
    // Overlap on Monday: 19:00-00:00 UTC → 5 one-hour slots (12pm-5pm Phoenix / 9am-2pm Honolulu)
    const scheduleA = await makeSchedule(
      [
        {
          service: genericVisit,
          duration: 60,
          timezone: 'America/Phoenix',
          availability: {
            url: 'availability',
            extension: [
              {
                url: 'availableTime',
                extension: [
                  { url: 'daysOfWeek', valueCode: 'mon' },
                  { url: 'availableStartTime', valueTime: '09:00:00' },
                  { url: 'availableEndTime', valueTime: '17:00:00' },
                ],
              },
            ],
          },
        },
      ],
      { actor: [createReference(practitioner)] }
    );

    const scheduleB = await makeSchedule(
      [
        {
          service: genericVisit,
          duration: 60,
          timezone: 'Pacific/Honolulu',
          availability: {
            url: 'availability',
            extension: [
              {
                url: 'availableTime',
                extension: [
                  { url: 'daysOfWeek', valueCode: 'mon' },
                  { url: 'availableStartTime', valueTime: '09:00:00' },
                  { url: 'availableEndTime', valueTime: '17:00:00' },
                ],
              },
            ],
          },
        },
      ],
      { actor: [createReference(location)] }
    );

    const response = await makeRequest({
      start: new Date('2026-03-16T00:00:00Z').toISOString(),
      end: new Date('2026-03-17T00:00:00Z').toISOString(),
      'service-type-reference': `HealthcareService/${genericVisit.id}`,
      schedule: [`Schedule/${scheduleA.id}`, `Schedule/${scheduleB.id}`],
    });

    expect(response.status).toBe(200);
    expect(response.body).not.toHaveProperty('issue');

    expect((response.body as Bundle<Appointment>).entry?.map((e) => e.resource?.start)).toEqual([
      '2026-03-16T19:00:00.000Z', // 12pm Phoenix / 9am Honolulu
      '2026-03-16T20:00:00.000Z', // 1pm Phoenix / 10am Honolulu
      '2026-03-16T21:00:00.000Z', // 2pm Phoenix / 11am Honolulu
      '2026-03-16T22:00:00.000Z', // 3pm Phoenix / 12pm Honolulu
      '2026-03-16T23:00:00.000Z', // 4pm Phoenix / 1pm Honolulu
    ]);
  });

  test('errors when `service-type-reference` parameter is omitted', async () => {
    const schedule = await makeSchedule([]);
    const response = await makeRequest({
      start: new Date('2026-03-16T00:00:00-04:00').toISOString(),
      end: new Date('2026-03-21T00:00:00-04:00').toISOString(),
      schedule: `Schedule/${schedule.id}`,
    });
    expect(response.body).toHaveProperty('issue', [
      {
        code: 'invalid',
        severity: 'error',
        details: {
          text: "Expected at least 1 value(s) for required input parameter 'service-type-reference'",
        },
      },
    ]);
    expect(response.status).toBe(400);
  });

  test('errors when `service-type-reference` parameter cannot be resolved', async () => {
    const schedule = await makeSchedule([]);
    const response = await makeRequest({
      start: new Date('2026-03-16T00:00:00-04:00').toISOString(),
      end: new Date('2026-03-21T00:00:00-04:00').toISOString(),
      schedule: `Schedule/${schedule.id}`,
      'service-type-reference': 'HealthcareService/00000000-0000-0000-0000-000000000000',
    });
    expect(response.body).toHaveProperty('issue', [
      {
        code: 'invalid',
        severity: 'error',
        details: {
          text: 'HealthcareService not found',
        },
      },
    ]);
    expect(response.status).toBe(400);
  });

  test('errors when `schedule` parameter is omitted', async () => {
    const response = await makeRequest({
      start: new Date('2026-03-16T00:00:00-04:00').toISOString(),
      end: new Date('2026-03-21T00:00:00-04:00').toISOString(),
      'service-type-reference': `HealthcareService/${genericVisit.id}`,
    });
    expect(response.status).toBe(400);
    expect(response.body.issue[0].details.text).toMatch(/schedule/);
  });

  test('errors when a schedule reference cannot be resolved', async () => {
    const response = await makeRequest({
      start: new Date('2026-03-16T00:00:00-04:00').toISOString(),
      end: new Date('2026-03-21T00:00:00-04:00').toISOString(),
      'service-type-reference': `HealthcareService/${genericVisit.id}`,
      schedule: 'Schedule/00000000-0000-0000-0000-000000000001',
    });
    expect(response.status).toBe(400);
    expect(response.body.issue[0].details.text).toBe('Loading schedule failed');
    expect(response.body.issue[0].expression).toEqual(['Parameters.schedule[0]']);
  });

  test('errors when Schedule.serviceType does not include a reference to the requested HealthcareService', async () => {
    const schedule = await systemRepo.createResource<Schedule>({
      resourceType: 'Schedule',
      meta: { project: project.id },
      actor: [createReference(practitioner)],
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [
            { url: 'service', valueReference: createReference(genericVisit) },
            { url: 'duration', valueDuration: { value: 30, unit: 'min' } },
            twoDaySchedule,
          ],
        },
      ],
    });

    const response = await makeRequest({
      start: new Date('2026-03-16T00:00:00-04:00').toISOString(),
      end: new Date('2026-03-21T00:00:00-04:00').toISOString(),
      'service-type-reference': `HealthcareService/${genericVisit.id}`,
      schedule: `Schedule/${schedule.id}`,
    });
    expect(response.body).toHaveProperty('issue', [
      {
        code: 'invalid',
        severity: 'error',
        details: {
          text: 'Schedule is not schedulable for requested service type',
        },
        expression: ['Parameters.schedule[0]'],
      },
    ]);
    expect(response.status).toBe(400);
  });

  test('errors on a schedule with multiple actors', async () => {
    const schedule = await systemRepo.createResource<Schedule>({
      resourceType: 'Schedule',
      meta: { project: project.id },
      actor: [createReference(practitioner), createReference(location)],
      serviceType: toCodeableReferenceLike(genericVisit),
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [
            { url: 'service', valueReference: createReference(genericVisit) },
            { url: 'duration', valueDuration: { value: 30, unit: 'min' } },
            twoDaySchedule,
          ],
        },
      ],
    });

    const response = await makeRequest({
      start: new Date('2026-03-16T00:00:00-04:00').toISOString(),
      end: new Date('2026-03-21T00:00:00-04:00').toISOString(),
      'service-type-reference': `HealthcareService/${genericVisit.id}`,
      schedule: `Schedule/${schedule.id}`,
    });
    expect(response.status).toBe(400);
    expect(response.body.issue[0].details.text).toBe('Scheduling only supported on schedules with exactly one actor');
  });

  test('errors when service type is not present on all schedules', async () => {
    // Schedule A has 'genricVisit'; Schedule B has only 'officeVisit'
    const scheduleA = await makeSchedule(
      [
        {
          service: genericVisit,
          duration: 30,
          availability: monTueAvailability,
        },
      ],
      { actor: [createReference(practitioner)] }
    );

    const scheduleB = await makeSchedule(
      [
        {
          service: officeVisit,
          duration: 30,
          availability: monTueAvailability,
        },
      ],
      { actor: [createReference(location)] }
    );

    const response = await makeRequest({
      start: new Date('2026-03-16T00:00:00-04:00').toISOString(),
      end: new Date('2026-03-21T00:00:00-04:00').toISOString(),
      'service-type-reference': `HealthcareService/${genericVisit.id}`,
      schedule: [`Schedule/${scheduleA.id}`, `Schedule/${scheduleB.id}`],
    });
    expect(response.status).toBe(400);
    expect(response.body.issue[0].details.text).toBe('Schedule is not schedulable for requested service type');
    expect(response.body.issue[0].expression).toEqual(['Parameters.schedule[1]']);
  });

  test('errors when `duration` scheduling parameter differs across schedules', async () => {
    // Both schedules have 'office-visit' but with different durations (30 vs 60)
    const scheduleA = await makeSchedule(
      [
        {
          service: genericVisit,
          duration: 30,
          availability: monTueAvailability,
        },
      ],
      { actor: [createReference(practitioner)] }
    );

    const scheduleB = await makeSchedule(
      [
        // This first scheduling parameters extension does not match the requested type and is ignored
        {
          service: officeVisit,
          duration: 60,
          availability: monTueAvailability,
        },

        // This extension matches the service-type, but the duration is mismatched and should be flagged
        {
          service: genericVisit,
          duration: 60,
          availability: monTueAvailability,
        },
      ],
      { actor: [createReference(location)] }
    );

    const response = await makeRequest({
      start: new Date('2026-03-16T00:00:00-04:00').toISOString(),
      end: new Date('2026-03-21T00:00:00-04:00').toISOString(),
      'service-type-reference': `HealthcareService/${genericVisit.id}`,
      schedule: [`Schedule/${scheduleA.id}`, `Schedule/${scheduleB.id}`],
    });
    expect(response.status).toBe(400);
    expect(response.body.issue[0].details.text).toBe("Scheduling parameters attribute 'duration' does not match");

    expect(response.body.issue[0].expression).toEqual([
      'Parameters.schedule[0].extension[0]',
      'Parameters.schedule[1].extension[1]',
    ]);
  });

  test('errors when `alignmentTimezone` scheduling parameter differs across schedules', async () => {
    // ScheduleA inherits `alignmentTimezone` from the service and gets `America/Chicago`.
    const scheduleA = await makeSchedule(
      [
        {
          service: genericVisit,
          availability: monTueAvailability,
        },
      ],
      { actor: [createReference(practitioner)] }
    );

    // ScheduleB explicitly sets `alignmentTimezone` to `America/New_York`
    const scheduleB = await makeSchedule(
      [
        {
          service: genericVisit,
          availability: monTueAvailability,
          alignmentTimezone: 'America/New_York',
        },
      ],
      { actor: [createReference(location)] }
    );

    const response = await makeRequest({
      start: new Date('2026-03-16T00:00:00-04:00').toISOString(),
      end: new Date('2026-03-21T00:00:00-04:00').toISOString(),
      'service-type-reference': `HealthcareService/${genericVisit.id}`,
      schedule: [`Schedule/${scheduleA.id}`, `Schedule/${scheduleB.id}`],
    });
    expect(response.status).toBe(400);
    expect(response.body.issue[0].details.text).toBe(
      "Scheduling parameters attribute 'alignmentTimezone' does not match"
    );

    expect(response.body.issue[0].expression).toEqual([
      'Parameters.service-type-reference.extension[0]',
      'Parameters.schedule[1].extension[0]',
    ]);
  });

  test('each schedule applies its own bufferBefore/bufferAfter independently', async () => {
    // scheduleA (practitioner): bufferBefore=30, duration=60, Mon/Tue 9am-5pm
    const scheduleA = await makeSchedule(
      [
        {
          service: genericVisit,
          bufferBefore: 30,
          duration: 60,
          availability: monTueAvailability,
        },
      ],
      { actor: [createReference(practitioner)] }
    );

    // scheduleB (location): bufferAfter=30, duration=60, Mon/Tue 9am-5pm
    const scheduleB = await makeSchedule(
      [
        {
          service: genericVisit,
          bufferAfter: 30,
          duration: 60,
          availability: monTueAvailability,
        },
      ],
      { actor: [createReference(location)] }
    );

    // Busy on scheduleA: 11:40am–11:55am EDT
    //   - blocks 11am slot directly (11:40am falls within the 11am–12pm appointment window)
    //   - blocks 12pm slot via bufferBefore (11:40am falls in the 11:30am–12pm buffer window)
    await systemRepo.createResource<Slot>({
      resourceType: 'Slot',
      meta: { project: project.id },
      schedule: createReference(scheduleA),
      status: 'busy',
      start: new Date('2026-03-16T11:40:00-04:00').toISOString(),
      end: new Date('2026-03-16T11:55:00-04:00').toISOString(),
    });

    // Busy on scheduleB: 03:05pm–03:25pm EDT
    //   - blocks 2pm slot via bufferAfter (2:05pm falls in the 2pm–2:30pm buffer window after the 2pm–3pm slot)
    //   - blocks 3pm slot directly (busy starts in the 3pm slot window)
    await systemRepo.createResource<Slot>({
      resourceType: 'Slot',
      meta: { project: project.id },
      schedule: createReference(scheduleB),
      status: 'busy',
      start: new Date('2026-03-16T15:05:00-04:00').toISOString(),
      end: new Date('2026-03-16T15:25:00-04:00').toISOString(),
    });

    const response = await makeRequest({
      start: new Date('2026-03-16T09:00:00-04:00').toISOString(),
      end: new Date('2026-03-16T18:00:00-04:00').toISOString(),
      'service-type-reference': `HealthcareService/${genericVisit.id}`,
      schedule: [`Schedule/${scheduleA.id}`, `Schedule/${scheduleB.id}`],
    });

    expect(response.status).toBe(200);
    expect(response.body).not.toHaveProperty('issue');

    const starts = (response.body as Bundle<Appointment>).entry?.map((e) => e.resource?.start) ?? [];

    // 9am EDT: blocked on A — bufferBefore window (8:30–9am) falls before schedule A's availability start
    expect(starts).not.toContain(new Date('2026-03-16T09:00:00-04:00').toISOString());
    // 10am EDT: bufferBefore window (9:30–10am) clear on A; bufferAfter window (10–10:30am) clear on B -> available
    expect(starts).toContain(new Date('2026-03-16T10:00:00-04:00').toISOString());
    // 11am EDT: blocked on A directly by A's busy slot; clear on B
    expect(starts).not.toContain(new Date('2026-03-16T11:00:00-04:00').toISOString());
    // 12pm EDT: blocked on A — bufferBefore window (11:30am–12pm) overlaps A's busy slot; clear on B
    expect(starts).not.toContain(new Date('2026-03-16T12:00:00-04:00').toISOString());
    // 1pm EDT: bufferBefore window (12:30–1pm) clear on A; bufferAfter window (2–2:30pm) clear on B -> available
    expect(starts).toContain(new Date('2026-03-16T13:00:00-04:00').toISOString());
    // 2pm EDT: OK on A (bufferBefore 1:30–2pm is clear), but blocked on B — bufferAfter window (3–3:30pm) overlaps B's busy slot
    expect(starts).not.toContain(new Date('2026-03-16T14:00:00-04:00').toISOString());
    // 3pm EDT: OK on A; blocked on B directly by B's busy slot
    expect(starts).not.toContain(new Date('2026-03-16T15:00:00-04:00').toISOString());
  });

  test('errors when one schedule has a planning horizon that excludes the requested range', async () => {
    const practitionerSchedule = await makeSchedule(
      [{ service: genericVisit, duration: 30, availability: monTueAvailability }],
      { actor: [createReference(practitioner)] }
    );
    // location schedule's horizon ends before the requested range starts
    const locationSchedule = await makeSchedule(
      [{ service: genericVisit, duration: 30, availability: tueWedAvailability }],
      {
        actor: [createReference(location)],
        planningHorizon: { end: '2026-03-15T00:00:00Z' },
      }
    );

    const response = await makeRequest({
      start: new Date('2026-03-16T00:00:00-04:00').toISOString(),
      end: new Date('2026-03-21T00:00:00-04:00').toISOString(),
      'service-type-reference': `HealthcareService/${genericVisit.id}`,
      schedule: [`Schedule/${practitionerSchedule.id}`, `Schedule/${locationSchedule.id}`],
    });

    expect(response.status).toBe(400);
    expect(response.body.issue[0].details.text).toBe('Search range starts after schedule planning horizon ends');
    expect(response.body.issue[0].expression).toEqual(['Parameters.schedule[1]']);
  });

  test('clips search range to intersection of planning horizons across schedules', async () => {
    // Both schedules cover Mon–Thu (fourDayWorkWeek).
    // scheduleA horizon starts Tue Mar 17 → Mon slots excluded by A's horizon.
    // scheduleB horizon ends Wed Mar 18 midnight → Wed/Thu slots excluded by B's horizon.
    // Effective range is Tue Mar 17 only; Mon and Wed slots must be absent.
    const scheduleA = await makeSchedule([{ service: genericVisit, duration: 60, availability: fourDayWorkWeek }], {
      actor: [createReference(practitioner)],
      planningHorizon: { start: '2026-03-17T00:00:00-04:00' },
    });
    const scheduleB = await makeSchedule([{ service: genericVisit, duration: 60, availability: fourDayWorkWeek }], {
      actor: [createReference(location)],
      planningHorizon: { end: '2026-03-18T00:00:00-04:00' },
    });

    const response = await makeRequest({
      start: new Date('2026-03-16T00:00:00-04:00').toISOString(),
      end: new Date('2026-03-19T17:00:00-04:00').toISOString(),
      'service-type-reference': `HealthcareService/${genericVisit.id}`,
      schedule: [`Schedule/${scheduleA.id}`, `Schedule/${scheduleB.id}`],
    });

    expect(response.status).toBe(200);
    expect(response.body).not.toHaveProperty('issue');

    const starts = (response.body as Bundle<Appointment>).entry?.map((e) => e.resource?.start) ?? [];

    expect(starts.length).toBeGreaterThan(0);
    // No Monday slots — excluded by scheduleA's planningHorizon.start
    // (fourDayWorkWeek with 60-min alignment produces slots at :00 — first is 10am)
    expect(starts).not.toContain(new Date('2026-03-16T10:00:00-04:00').toISOString());
    // Tuesday slots present — within both planning horizons
    expect(starts).toContain(new Date('2026-03-17T10:00:00-04:00').toISOString());
    // No Wednesday slots — excluded by scheduleB's planningHorizon.end
    expect(starts).not.toContain(new Date('2026-03-18T10:00:00-04:00').toISOString());
  });

  test('_count is respected for multi-schedule results', async () => {
    // Mon,Tue, 9a-5p availability
    const scheduleA = await makeSchedule(
      [
        {
          service: genericVisit,
          duration: 60,
          availability: monTueAvailability,
        },
      ],
      { actor: [createReference(practitioner)] }
    );

    // Tue,Wed, 1p-6p availability
    const scheduleB = await makeSchedule(
      [
        {
          service: genericVisit,
          duration: 60,
          availability: tueWedAvailability,
        },
      ],
      { actor: [createReference(location)] }
    );

    // Overlap window is Tue 1pm-5pm EDT (4 × 60-min slots); requesting only 2
    const response = await makeRequest({
      start: new Date('2026-03-16T00:00:00-04:00').toISOString(),
      end: new Date('2026-03-18T00:00:00-04:00').toISOString(),
      'service-type-reference': `HealthcareService/${genericVisit.id}`,
      _count: '2',
      schedule: [`Schedule/${scheduleA.id}`, `Schedule/${scheduleB.id}`],
    });

    expect(response.status).toBe(200);
    expect(response.body.entry).toHaveLength(2);
  });

  test('Appointments contain nested Slot resources for each schedule', async () => {
    // Mon,Tue, 9a-5p availability
    const practitionerSchedule = await makeSchedule(
      [
        {
          service: genericVisit,
          duration: 30,
          bufferBefore: 20,
          bufferAfter: 15,
          availability: monTueAvailability,
        },
      ],
      { actor: [createReference(practitioner)] }
    );

    // Tue,Wed, 1p-6p availability
    const locationSchedule = await makeSchedule(
      [
        {
          service: genericVisit,
          duration: 30,
          availability: tueWedAvailability,
        },
      ],
      { actor: [createReference(location)] }
    );

    const response = await makeRequest({
      start: new Date('2026-03-17T11:00:00-04:00').toISOString(),
      end: new Date('2026-03-17T14:00:00-04:00').toISOString(),
      'service-type-reference': `HealthcareService/${genericVisit.id}`,
      schedule: [`Schedule/${practitionerSchedule.id}`, `Schedule/${locationSchedule.id}`],
    });
    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toBe(200);

    expect(response.body).toMatchObject({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        {
          resource: {
            resourceType: 'Appointment',
            status: 'proposed',
            start: new Date('2026-03-17T13:00:00-04:00').toISOString(),
            end: new Date('2026-03-17T13:30:00-04:00').toISOString(),
            serviceType: [{ coding: [{ code: 'generic-visit' }] }],
            participant: [
              {
                actor: { reference: `Practitioner/${practitioner.id}` },
                required: 'required',
                status: 'needs-action',
              },
              {
                actor: { reference: `Location/${location.id}` },
                required: 'required',
                status: 'needs-action',
              },
            ],
            contained: [
              // practitioner schedule: main appointment block
              {
                resourceType: 'Slot',
                schedule: { reference: `Schedule/${practitionerSchedule.id}` },
                start: new Date('2026-03-17T13:00:00-04:00').toISOString(),
                end: new Date('2026-03-17T13:30:00-04:00').toISOString(),
                status: 'busy',
                serviceType: [{ coding: [{ code: 'generic-visit' }] }],
              },
              // practitioner schedule: buffer before block
              {
                resourceType: 'Slot',
                schedule: { reference: `Schedule/${practitionerSchedule.id}` },
                start: new Date('2026-03-17T12:40:00-04:00').toISOString(),
                end: new Date('2026-03-17T13:00:00-04:00').toISOString(),
                status: 'busy-unavailable',
                serviceType: [{ coding: [{ code: 'generic-visit' }] }],
                comment: 'buffer before appointment',
              },
              // practitioner schedule: buffer after block
              {
                resourceType: 'Slot',
                schedule: { reference: `Schedule/${practitionerSchedule.id}` },
                start: new Date('2026-03-17T13:30:00-04:00').toISOString(),
                end: new Date('2026-03-17T13:45:00-04:00').toISOString(),
                status: 'busy-unavailable',
                serviceType: [{ coding: [{ code: 'generic-visit' }] }],
                comment: 'buffer after appointment',
              },
              // location schedule: main appointment block
              {
                resourceType: 'Slot',
                schedule: { reference: `Schedule/${locationSchedule.id}` },
                start: new Date('2026-03-17T13:00:00-04:00').toISOString(),
                end: new Date('2026-03-17T13:30:00-04:00').toISOString(),
                status: 'busy',
                serviceType: [{ coding: [{ code: 'generic-visit' }] }],
              },
            ],
          },
        },
      ],
    });
  });

  test('alignmentTimezone anchors the slot grid to local midnight', async () => {
    // America/Chicago in December is CST (UTC-6). The Chicago midnight grid with
    // alignment=50 has grid starts at 10:00, 10:50, 11:40 CST within the 09:30-12:30
    // availability window. UTC anchoring would give 09:50, 10:40, 11:30 CST instead.
    const schedule = await makeSchedule(
      [
        {
          service: genericVisit,
          availability: fourDayWorkWeek,
          duration: 40,
          alignmentInterval: 50,
          alignmentTimezone: 'America/Chicago',
          timezone: 'America/Chicago',
        },
      ],
      { actor: [createReference(practitioner)] }
    );
    // Search Monday December 1, 2025, 09:30-12:30 CST window.
    const response = await makeRequest({
      start: new Date('2025-12-01T09:30:00.000-06:00').toISOString(),
      end: new Date('2025-12-01T12:30:00.000-06:00').toISOString(),
      schedule: [`Schedule/${schedule.id}`],
      'service-type-reference': `HealthcareService/${genericVisit.id}`,
    });
    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      resourceType: 'Bundle',
      type: 'searchset',
    });

    const startTimes = (response.body as Bundle<Appointment>).entry?.map((e) => e.resource?.start) ?? [];
    expect(startTimes).toEqual([
      new Date('2025-12-01T10:00:00.000-06:00').toISOString(),
      new Date('2025-12-01T10:50:00.000-06:00').toISOString(),
      new Date('2025-12-01T11:40:00.000-06:00').toISOString(),
    ]);
  });

  test('uses default search page size of 20 results', async () => {
    // Mon,Tue, 9a-5p availability
    const practitionerSchedule = await makeSchedule([
      {
        service: genericVisit,
        duration: 30,
        availability: monTueAvailability,
      },
    ]);

    const response = await makeRequest({
      start: new Date('2026-01-01T00:00:00-05:00').toISOString(),
      end: new Date('2026-02-01T00:00:00-05:00').toISOString(),
      'service-type-reference': `HealthcareService/${genericVisit.id}`,
      schedule: `Schedule/${practitionerSchedule.id}`,
    });

    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toBe(200);
    expect(response.body.entry).toHaveLength(20);
  });

  test('can override search page size with `_count`', async () => {
    // Mon,Tue, 9a-5p availability
    const practitionerSchedule = await makeSchedule([
      {
        service: genericVisit,
        duration: 30,
        availability: monTueAvailability,
        // `alignmentInterval: 2` creates possible slots every two minutes, ensuring lots
        // of results so we can test the maximum page size
        alignmentInterval: 2,
      },
    ]);

    const smallResponse = await makeRequest({
      start: new Date('2026-01-01T00:00:00-05:00').toISOString(),
      end: new Date('2026-02-01T00:00:00-05:00').toISOString(),
      'service-type-reference': `HealthcareService/${genericVisit.id}`,
      schedule: `Schedule/${practitionerSchedule.id}`,
      _count: '1',
    });

    expect(smallResponse.body).not.toHaveProperty('issue');
    expect(smallResponse.status).toBe(200);
    expect(smallResponse.body.entry).toHaveLength(1);

    const largeResponse = await makeRequest({
      start: new Date('2026-01-01T00:00:00-05:00').toISOString(),
      end: new Date('2026-02-01T00:00:00-05:00').toISOString(),
      'service-type-reference': `HealthcareService/${genericVisit.id}`,
      schedule: `Schedule/${practitionerSchedule.id}`,
      _count: '1000',
    });

    expect(largeResponse.body).not.toHaveProperty('issue');
    expect(largeResponse.status).toBe(200);
    expect(largeResponse.body.entry).toHaveLength(1000);
  });

  test('validates `_count` is in an acceptable range', async () => {
    // Mon,Tue, 9a-5p availability
    const practitionerSchedule = await makeSchedule([
      {
        service: genericVisit,
        duration: 30,
        availability: monTueAvailability,
      },
    ]);

    const smallResponse = await makeRequest({
      start: new Date('2026-01-01T00:00:00-05:00').toISOString(),
      end: new Date('2026-02-01T00:00:00-05:00').toISOString(),
      'service-type-reference': `HealthcareService/${genericVisit.id}`,
      schedule: `Schedule/${practitionerSchedule.id}`,
      _count: '0',
    });

    expect(smallResponse.body).toHaveProperty('issue', [
      {
        code: 'invalid',
        severity: 'error',
        details: {
          text: 'Invalid _count, minimum required is 1',
        },
      },
    ]);
    expect(smallResponse.status).toBe(400);

    const largeResponse = await makeRequest({
      start: new Date('2026-01-01T00:00:00-05:00').toISOString(),
      end: new Date('2026-02-01T00:00:00-05:00').toISOString(),
      'service-type-reference': `HealthcareService/${genericVisit.id}`,
      schedule: `Schedule/${practitionerSchedule.id}`,
      _count: '1001',
    });

    expect(largeResponse.body).toHaveProperty('issue', [
      {
        code: 'invalid',
        severity: 'error',
        details: {
          text: 'Invalid _count, maximum allowed is 1000',
        },
      },
    ]);
    expect(largeResponse.status).toBe(400);
  });

  test('it works when HealthcareService.type has no codes', async () => {
    // create a HealthcareService with no `type` attribute
    const emptyService = await systemRepo.createResource<HealthcareService>({
      resourceType: 'HealthcareService',
      meta: { project: project.id },
      name: 'Empty Service',
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [
            {
              url: 'duration',
              valueDuration: { value: 60, unit: 'min' },
            },
          ],
        },
      ],
    });

    // Link a Schedule to it (via a `serviceType` CodeableConcept with only
    // `extension` attribute, no `coding`)
    const schedule = await systemRepo.createResource<Schedule>({
      resourceType: 'Schedule',
      meta: { project: project.id },
      actor: [createReference(practitioner)],
      serviceType: [
        {
          extension: [
            {
              url: ServiceTypeReferenceURI,
              valueReference: createReference(emptyService),
            },
          ],
        },
      ],
    });

    const response = await request
      .get(`/fhir/R4/Appointment/$find`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .query({
        start: new Date('2025-12-05T10:00:00.000-05:00').toISOString(),
        end: new Date('2025-12-05T14:00:00.000-05:00').toISOString(),
        schedule: `Schedule/${schedule.id}`,
        'service-type-reference': `HealthcareService/${emptyService.id}`,
      });

    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('entry');
    expect(response.body.entry).toHaveLength(4);
  });
});
